/**
 * Guards for email headers. Values that end up in To, Subject and friends can come from an incoming email or from the
 * model (which has read incoming email), so a line break in one could add a header of the attacker's choosing,
 * such as a hidden Bcc. Everything is checked or encoded here before it reaches a header.
 */

export class HeaderError extends Error {}

const BREAKS = /[\r\n\0\u2028\u2029]/;

/** A header value with no line breaks, trimmed and length-limited. Throws instead of quietly changing it. */
export function cleanHeader(value: string, field: string, max = 900): string {
  if (BREAKS.test(value)) throw new HeaderError(`${field} contains a line break, which is not allowed.`);
  const v = value.trim();
  if (v.length > max) throw new HeaderError(`${field} is too long.`);
  return v;
}

const ADDR = "[^\\s@<>,;\"()\\[\\]\\\\]+@[^\\s@<>,;\"()\\[\\]\\\\]+\\.[^\\s@<>,;\"()\\[\\]\\\\]+";
const BARE = new RegExp(`^${ADDR}$`);
/** One mailbox: `a@b.com`, `Some Name <a@b.com>` or `"Last, First" <a@b.com>`. */
const MAILBOX = new RegExp(`^(?:(?:"[^"\\r\\n]{0,80}"|[^<>@,;"\\r\\n]{0,80})\\s*<${ADDR}>|${ADDR})$`);
export const isSingleAddress = (v: string) => BARE.test(v.trim());

/** Splits "a@x.com, "Doe, J" <b@y.com>" on the commas that are not inside quotes. */
function splitList(v: string): string[] {
  const out: string[] = [];
  let cur = "", quoted = false;
  for (const ch of v) {
    if (ch === '"') quoted = !quoted;
    if (ch === "," && !quoted) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** A recipient list of at most 5 mailboxes. Throws on anything else, including line breaks. */
export function cleanRecipients(value: string, field = "To"): string {
  const v = cleanHeader(value, field, 400);
  if (!v) return v;
  const parts = splitList(v);
  if (parts.length > 5 || parts.some((p) => !MAILBOX.test(p))) throw new HeaderError(`${field} is not a valid email address.`);
  return parts.join(", ");
}

/**
 * The bare address from a header like `"Doe, J" <j@x.com>`, for replies. Only the first person is used, so a reply
 * goes to the sender and never fans out to a list an incoming email chose.
 */
export function firstAddress(value: string, field = "To"): string {
  const v = cleanHeader(value, field, 998);
  const first = splitList(v)[0] ?? "";
  const bare = /<([^<>\s]+)>\s*$/.exec(first)?.[1] ?? first;
  if (!BARE.test(bare)) throw new HeaderError(`${field} is not a valid email address.`);
  return bare;
}

/** RFC 2047 encoded-word, so a subject or name with accents or emoji survives. Plain ASCII passes through untouched. */
export function encodeHeader(value: string): string {
  const v = cleanHeader(value, "Header");
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`;
}

/** For headers copied from an existing email (Message-ID, References): drop them if they look wrong rather than copy them. */
export function safeCopied(value: string): string | null {
  if (BREAKS.test(value) || value.length > 998) return null;
  return value.trim() || null;
}
