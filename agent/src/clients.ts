import { get, logActivity, run } from "./db.js";

/**
 * Deleting a client removes Opus's own record of them: the inquiry, its contract draft and the waiting reply draft in the dashboard.
 * It never touches Gmail. The original email and any Gmail draft stay where they are. Only the dashboard can call this.
 */
export function deleteClient(id: number): { name: string; hadSentContract: boolean } | null {
  const inq = get<{ id: number; name: string; email: string; thread_id: string | null }>("SELECT id, name, email, thread_id FROM inquiries WHERE id = ?", id);
  if (!inq) return null;
  const contract = get<{ status: string }>("SELECT status FROM contracts WHERE inquiry_id = ?", id);
  run("DELETE FROM contracts WHERE inquiry_id = ?", id);
  if (inq.thread_id) run("UPDATE drafts SET status = 'dismissed' WHERE thread_id = ? AND status = 'waiting'", inq.thread_id);
  run("DELETE FROM inquiries WHERE id = ?", id);
  logActivity({ kind: "system", job: "clients", summary: `You deleted the client "${inq.name || inq.email || `#${id}`}"${contract ? (contract.status === "sent" ? " and their sent contract record" : " and their contract draft") : ""}. Gmail was not touched.` });
  return { name: inq.name, hadSentContract: contract?.status === "sent" };
}
