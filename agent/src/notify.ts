import { config } from "./config.js";

/**
 * Phone notifications. Uses a Telegram bot when TELEGRAM_BOT_TOKEN and
 * TELEGRAM_CHAT_ID are set, otherwise prints to the console.
 */
export async function notify(text: string, opts: { urgent?: boolean } = {}) {
  const prefix = opts.urgent ? "[urgent] " : "";
  console.log(`[notify] ${prefix}${text}`);

  const { botToken, chatId } = config.telegram;
  if (!botToken || !chatId || config.mock) return;

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: `${prefix}${text}`, disable_notification: !opts.urgent }),
    });
    if (!res.ok) console.warn(`[notify] Telegram returned ${res.status}`);
  } catch (err) {
    console.warn("[notify] Telegram request failed:", err instanceof Error ? err.message : err);
  }
}
