import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import type { Usage } from "./cost.js";
import { mockLLM } from "./mock.js";

export type Msg = Anthropic.MessageParam;
export type Tool = Anthropic.Tool;

export interface LLMRequest {
  model: string;
  system: string;
  tools: Tool[];
  messages: Msg[];
  max_tokens: number;
  tool_choice?: { type: "auto" } | { type: "tool"; name: string };
}

export interface LLMResponse {
  content: Anthropic.ContentBlock[];
  stop_reason: string | null;
  usage: Usage;
}

/** The only thing the rest of the app knows about the model. Real and mock both implement it. */
export interface LLM {
  create(req: LLMRequest): Promise<LLMResponse>;
}

export function makeLLM(): LLM {
  if (config.mock) return mockLLM();

  if (!config.anthropicKey) {
    throw new Error("ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key, or run the :mock commands.");
  }
  const client = new Anthropic({ apiKey: config.anthropicKey });

  return {
    async create(req) {
      const res = await client.messages.create({
        model: req.model,
        max_tokens: req.max_tokens,
        // The system prompt and tool list repeat on every call, so cache them.
        system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
        tools: req.tools,
        tool_choice: req.tool_choice,
        messages: req.messages,
      });
      return {
        content: res.content,
        stop_reason: res.stop_reason,
        usage: {
          input_tokens: res.usage.input_tokens,
          output_tokens: res.usage.output_tokens,
          cache_read_input_tokens: res.usage.cache_read_input_tokens ?? 0,
          cache_creation_input_tokens: res.usage.cache_creation_input_tokens ?? 0,
        },
      };
    },
  };
}
