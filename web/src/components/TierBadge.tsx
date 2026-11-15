import type { Tier } from "@/lib/contract";
import { tierClass } from "@/lib/format";

const tierTitle: Record<Tier, string> = {
  P1: "Urgent: act first", P2: "High priority", P3: "Normal priority", P4: "Low priority",
};
const tierDot: Record<Tier, string> = { P1: "bg-p1", P2: "bg-p2", P3: "bg-faint", P4: "bg-line-strong" };

export function TierBadge({ tier, className = "" }: { tier: Tier; className?: string }) {
  return (
    <span title={tierTitle[tier]}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tierClass[tier]} ${className}`}>
      <span className={`size-1.5 rounded-full ${tierDot[tier]}`} />
      {tier}
    </span>
  );
}

export function ReviewBadge() {
  return (
    <span title="A person needs to check this network"
      className="inline-flex items-center rounded-full border border-dashed border-line-strong px-2 py-0.5 text-[11px] font-medium text-muted">
      Review
    </span>
  );
}
