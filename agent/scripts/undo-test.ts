// Checks undoApproval against a throwaway database. Run: npm run test:undo
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), "opus-undo-")), "test.db");

const { run, get, all, nowIso } = await import("../src/db.js");
const { decideApproval, undoApproval } = await import("../src/jobs.js");

const add = (id: string, status: string, sub: string | null) =>
  run(
    "INSERT INTO approvals (id, kind, title, reason, subscription_id, status, created_at) VALUES (?, 'cancel', ?, 'because', ?, ?, ?)",
    id, `Prepare cancellation: ${id}`, sub, status, nowIso(),
  );
const status = (id: string) => get<{ status: string; decided_at: string | null }>("SELECT status, decided_at FROM approvals WHERE id = ?", id)!;

// 1. A dismissed item comes back as pending and loses its decision time.
add("a1", "pending", null);
await decideApproval({} as never, "a1", "dismiss");
assert.equal(status("a1").status, "dismissed");
assert.ok(status("a1").decided_at);
assert.equal(undoApproval("a1"), "restored");
assert.equal(status("a1").status, "pending");
assert.equal(status("a1").decided_at, null);

// 2. Pending and approved items cannot be undone.
assert.equal(undoApproval("a1"), "not-dismissed");
add("a2", "approved", null);
assert.equal(undoApproval("a2"), "not-dismissed");
assert.equal(status("a2").status, "approved");

// 3. Unknown id.
assert.equal(undoApproval("nope"), "missing");

// 4. No duplicates: a newer pending approval for the same subscription blocks the undo.
add("old", "dismissed", "sub-x");
add("new", "pending", "sub-x");
assert.equal(undoApproval("old"), "duplicate");
assert.equal(status("old").status, "dismissed");

// 5. Undo is recorded in Activity, and only the restored item was logged.
const logged = all<{ summary: string }>("SELECT summary FROM activity WHERE summary LIKE 'You put back in the queue:%'");
assert.equal(logged.length, 1);

console.log("undo tests passed");
