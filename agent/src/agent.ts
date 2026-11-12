import type Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import { costUsd } from "./cost.js";
import { logActivity } from "./db.js";
import type { Mailbox } from "./gmail.js";
import type { LLM, Msg } from "./llm.js";
import { executeTool, toolsFor } from "./tools.js";

export interface RunOptions {
  job: string;
  model: string;
  system: string;
  tools: string[];
  prompt: string;
  mailbox: Mailbox;
  llm: LLM;
  maxTurns?: number;
  maxTokens?: number;
  maxRunUsd?: number;
  /** Earlier chat turns, plain text, oldest first. */
  history?: Msg[];
}

export interface RunResult {
  text: string;
  spentUsd: number;
  turns: number;
  stoppedBy: "done" | "turns" | "run_budget";
}

/**
 * The agent loop: Claude picks a tool, we run it, Claude sees the result,
 * repeat until it is done. Every model call is priced and logged, and a single
 * run cannot spend past its own cap.
 */
export async function runAgent(o: RunOptions): Promise<RunResult> {
  const maxTurns = o.maxTurns ?? 8;
  const cap = o.maxRunUsd ?? config.budget.maxRunUsd;
  const messages: Msg[] = [...(o.history ?? []), { role: "user", content: o.prompt }];
  const tools = toolsFor(o.tools);
  let spent = 0;
  let text = "";
  let nudged = false;

  for (let turn = 1; turn <= maxTurns; turn++) {
    const res = await o.llm.create({ model: o.model, system: o.system, tools, messages, max_tokens: o.maxTokens ?? 1500 });

    // Web searches are billed per search, on top of tokens (about $10 per 1,000).
    const searches = res.content.filter((b) => b.type === "server_tool_use").length;
    const cost = costUsd(o.model, res.usage) + searches * 0.01;
    spent += cost;
    logActivity({
      kind: "model",
      job: o.job,
      summary: `Model call ${turn}`,
      model: o.model,
      inputTokens: res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0),
      outputTokens: res.usage.output_tokens,
      costUsd: cost,
    });

    messages.push({ role: "assistant", content: res.content as Anthropic.ContentBlockParam[] });
    text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");

    const calls = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    // A long server-side search can pause the turn. Resume by sending the same conversation back.
    if (calls.length === 0 && res.stop_reason === "pause_turn") continue;
    // The model sometimes ends right after reading files without writing an answer. Ask once for the answer.
    if (calls.length === 0 && !text.trim() && turn > 1 && turn < maxTurns && !nudged) {
      nudged = true;
      messages.push({ role: "user", content: "You stopped without answering. Write your answer to my question now, in plain text, using what you have read. Show the numbers you used, and say which ones you could not read." });
      continue;
    }
    if (calls.length === 0) return { text, spentUsd: spent, turns: turn, stoppedBy: "done" };

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of calls) {
      // Only tools this job was given may run, even if the model asks for another.
      const allowed = o.tools.includes(call.name);
      const out = allowed
        ? await executeTool({ job: o.job, mailbox: o.mailbox }, call.name, call.input as Record<string, unknown>)
        : { output: `Tool "${call.name}" is not available in this job.`, isError: true };
      const images = (out as { images?: { media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string }[] }).images;
      results.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: images?.length
          ? [{ type: "text", text: out.output }, ...images.map((im) => ({ type: "image" as const, source: { type: "base64" as const, media_type: im.media_type, data: im.data } }))]
          : out.output,
        is_error: out.isError,
      });
    }
    messages.push({ role: "user", content: results });

    if (spent >= cap) {
      logActivity({ kind: "system", job: o.job, summary: `Stopped ${o.job}: it reached its $${cap.toFixed(2)} per-run limit` });
      return { text, spentUsd: spent, turns: turn, stoppedBy: "run_budget" };
    }
  }

  logActivity({ kind: "system", job: o.job, summary: `Stopped ${o.job}: it used all ${maxTurns} turns` });
  return { text, spentUsd: spent, turns: maxTurns, stoppedBy: "turns" };
}
