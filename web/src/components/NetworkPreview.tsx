"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Network } from "@/lib/contract";
import { typologyLabel } from "@/lib/format";
import { ReviewBadge, TierBadge } from "./TierBadge";

export function NetworkPreview() {
  const [nets, setNets] = useState<Network[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.networks().then(setNets).catch(() => setFailed(true));
  }, []);

  const top = nets?.slice().sort((a, b) => a.priority.rank - b.priority.rank).slice(0, 4) ?? [];
  const lead = top[0];

  return (
    <div className="overflow-hidden rounded-2xl border border-line-strong bg-bg-raised shadow-[0_30px_80px_-30px_rgba(42,86,240,.35)]">
      <div className="flex items-center justify-between border-b border-line px-4 py-3 font-mono text-xs text-muted">
        <span className="text-fg">Networks, ranked by priority</span>
        <span>{nets ? `${nets.length} networks` : "loading"}</span>
      </div>
      <div className="grid md:grid-cols-[1.1fr_1fr]">
        <ul className="flex flex-col gap-2 p-3">
          {failed && <li className="p-4 text-sm text-muted">The engine is not reachable. Start it, then reload.</li>}
          {!nets && !failed && [0, 1, 2, 3].map((i) => <li key={i} className="h-[62px] animate-pulse rounded-xl bg-sunk" />)}
          {top.map((n) => (
            <li key={n.id} className="grid grid-cols-[28px_1fr_auto] items-center gap-3 rounded-xl border border-line bg-bg px-3 py-3">
              <span className="font-mono text-sm text-muted">#{n.priority.rank}</span>
              <div className="min-w-0">
                <div className="text-sm font-semibold">{n.id}</div>
                <div className="truncate text-xs text-muted">
                  {typologyLabel[n.typology.label]} · {n.metrics.case_count} reports
                </div>
              </div>
              {n.status === "needs_review" ? <ReviewBadge /> : <TierBadge tier={n.priority.tier} />}
            </li>
          ))}
        </ul>
        <div className="border-t border-line p-5 md:border-l md:border-t-0">
          <div className="font-mono text-[11px] uppercase tracking-wider text-faint">Brief for {lead?.id ?? "…"}</div>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {lead?.brief?.summary ?? (nets ? "No brief yet for this network." : "")}
          </p>
          {lead?.brief?.checked && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-good-bg px-3 py-1 text-xs text-good">
              <span className="size-1.5 rounded-full bg-good" /> Every claim checked against the links
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
