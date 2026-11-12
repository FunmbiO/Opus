import { extract, PasswordRequired, type Extracted } from "./attachments.js";
import { logActivity } from "./db.js";
import type { Mailbox } from "./gmail.js";

/**
 * Password-protected attachments.
 *
 * The password is typed by you into a private box on the dashboard and goes
 * straight to unlockAttachment() below. It never passes through the model, the
 * chat history, the database or the logs, and it is not stored. Only the
 * extracted text is kept, in memory, for 15 minutes, so the model can read it
 * when it asks again. Nothing here can be called by the model.
 */

export class UnlockError extends Error {}

const TTL_MS = 15 * 60_000;
const MAX_ENTRIES = 10;
const MAX_WRONG = 5;

const unlocked = new Map<string, { got: Extracted; expires: number }>();
const wrongTries = new Map<string, { n: number; since: number }>();
const key = (threadId: string, n: number) => `${threadId}:${n}`;

function sweep() {
  const now = Date.now();
  for (const [k, v] of unlocked) if (v.expires < now) unlocked.delete(k);
  while (unlocked.size > MAX_ENTRIES) unlocked.delete(unlocked.keys().next().value as string);
}

/** Text of an attachment you unlocked recently, if any. */
export function unlockedText(threadId: string, n: number): Extracted | undefined {
  sweep();
  return unlocked.get(key(threadId, n))?.got;
}

// ---- Requests the Ask page should show a password box for ------------------

export interface PasswordRequest { threadId: string; number: number; filename: string; subject: string }
const requests: (PasswordRequest & { at: number })[] = [];

export function requestPassword(r: PasswordRequest) {
  const old = requests.find((x) => x.threadId === r.threadId && x.number === r.number);
  if (old) old.at = Date.now(); // ask again, so the box shows up again
  else requests.push({ ...r, at: Date.now() });
}

// ---- Optional: one password for a batch of files (all your paystubs) -------

let shared: { pw: string; expires: number } | undefined;
/** Only set when you tick the box. Memory only, 15 minutes, never given to the model. */
export function sharedPassword(): string | undefined {
  if (shared && shared.expires < Date.now()) shared = undefined;
  return shared?.pw;
}
export function forgetSharedPassword() { shared = undefined; }
export const requestsSince = (t: number): PasswordRequest[] => requests.filter((r) => r.at >= t).map(({ at: _a, ...r }) => r);

// ---- The unlock itself ------------------------------------------------------

export async function unlockAttachment(mailbox: Mailbox, threadId: string, n: number, password: string, reuse = false): Promise<{ filename: string }> {
  const k = key(threadId, n);
  const t = wrongTries.get(k);
  if (t && Date.now() - t.since < 10 * 60_000 && t.n >= MAX_WRONG) throw new UnlockError("Too many wrong tries. Wait ten minutes, then try again.");
  if (!password) throw new UnlockError("Enter the password.");

  const file = await mailbox.readAttachment(threadId, n);
  try {
    const got = await extract(file.filename, file.mimeType, file.data, password);
    wrongTries.delete(k);
    unlocked.set(k, { got, expires: Date.now() + TTL_MS });
    if (reuse) shared = { pw: password, expires: Date.now() + TTL_MS };
    sweep();
    // The log names the file only. It never contains the password.
    logActivity({ kind: "system", job: "attachments", summary: `You unlocked "${file.filename}" for Opus to read${reuse ? " (and for other locked files for 15 minutes)" : ""}${got.note && !got.images ? ". It has no readable text" : ""}` });
    return { filename: file.filename };
  } catch (err) {
    if (err instanceof PasswordRequired) {
      const cur = t && Date.now() - t.since < 10 * 60_000 ? t : { n: 0, since: Date.now() };
      wrongTries.set(k, { n: cur.n + 1, since: cur.since });
      throw new UnlockError("That password didn't work.");
    }
    throw err;
  }
}
