import type { Tier } from "@/lib/contract";
import { tierClass } from "@/lib/format";

export function TierBadge({ tier, className = "" }: { tier: Tier; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold ${tierClass[tier]} ${className}`}>
      {tier}
    </span>
  );
}

export function ReviewBadge() {
  return (
    <span className="inline-flex items-center rounded-md border border-dashed border-line-strong px-1.5 py-0.5 font-mono text-[11px] text-muted">
      review
    </span>
  );
}
