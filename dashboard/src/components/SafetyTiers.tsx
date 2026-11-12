import { Icon } from "./Icons";

const TIERS = [
  { id: "auto", title: "Opus does on its own", icon: "mail", items: ["Read and sort your inbox", "Write reply drafts into Gmail Drafts", "Track subscriptions and flag the ones worth a look", "Put suggestions in this queue"] },
  { id: "ask", title: "Needs your say-so", icon: "approve", items: ["Everything in this queue: approving only makes Opus write the steps", "Sending a contract email: you press send, in the dashboard"] },
  { id: "never", title: "Opus never does", icon: "lock", items: ["Send mail by itself", "Delete, trash or label anything", "Cancel a subscription for you", "Move money"] },
] as const;

/** The permission tiers, in plain words. The rules live in code (`npm run safety`), not in the prompt. */
export function SafetyTiers() {
  return (
    <section className="aq-tiers" aria-label="What Opus can and cannot do">
      <h3 className="sect">What Opus can and can't do</h3>
      <div className="aq-tier-grid">
        {TIERS.map((t) => (
          <div key={t.id} className={`aq-tier t-${t.id}`}>
            <div className="aq-tier-head"><Icon name={t.icon} size={16} /><strong>{t.title}</strong></div>
            <ul>{t.items.map((i) => <li key={i}>{i}</li>)}</ul>
          </div>
        ))}
      </div>
      <p className="aq-tier-note">These limits are in the code. There is no function that deletes, cancels or sends mail on its own.</p>
    </section>
  );
}
