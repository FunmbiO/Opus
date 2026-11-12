import type { Approval, State, Sub } from "./types";
import { daysUntil } from "./format";

export type KindFilter = "all" | "cancel" | "other";
export type SortKey = "newest" | "saving" | "soonest";

/** Plain-language description of each kind of approval. */
export const KIND: Record<string, { label: string; verb: string; outcome: string }> = {
  cancel: {
    label: "Cancel",
    verb: "Approve: prepare it",
    outcome: "Opus writes the cancellation steps (or a draft email). Nothing is cancelled for you.",
  },
};

export const kindMeta = (kind: string) =>
  KIND[kind] ?? { label: kind || "Other", verb: "Approve: prepare it", outcome: "Opus prepares the next step for you to review. Nothing is sent or changed for you." };

export const isCancel = (a: Approval) => a.kind === "cancel";

export const pendingOf = (list: Approval[]) => list.filter((a) => a.status === "pending");
export const decidedOf = (list: Approval[]) => list.filter((a) => a.status !== "pending");

/** The subscription an approval is about, if any. */
export function linkedSub(a: Approval, subs: Sub[]): Sub | null {
  return a.subscriptionId ? subs.find((x) => x.id === a.subscriptionId) ?? null : null;
}

/** Monthly amount that would stop if this approval went ahead. Zero when unknown. */
export const monthlySaving = (a: Approval, subs: Sub[]) =>
  isCancel(a) ? linkedSub(a, subs)?.monthlyEquivalent ?? 0 : 0;

export const totalSaving = (list: Approval[], subs: Sub[]) =>
  list.reduce((sum, a) => sum + monthlySaving(a, subs), 0);

export function filterApprovals(list: Approval[], f: KindFilter): Approval[] {
  if (f === "all") return list;
  return list.filter((a) => (f === "cancel" ? isCancel(a) : !isCancel(a)));
}

export function sortApprovals(list: Approval[], key: SortKey, s: Pick<State, "subscriptions" | "now">): Approval[] {
  const out = [...list];
  if (key === "newest") return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (key === "saving") return out.sort((a, b) => monthlySaving(b, s.subscriptions) - monthlySaving(a, s.subscriptions));
  // soonest: closest upcoming charge first; no date goes last
  const days = (a: Approval) => {
    const d = daysUntil(linkedSub(a, s.subscriptions)?.nextCharge ?? null, s.now);
    return d == null || d < 0 ? Number.POSITIVE_INFINITY : d;
  };
  return out.sort((a, b) => days(a) - days(b));
}

export const counts = (list: Approval[]) => ({
  waiting: list.filter((a) => a.status === "pending").length,
  prepared: list.filter((a) => a.status === "approved").length,
  dismissed: list.filter((a) => a.status === "dismissed").length,
});
