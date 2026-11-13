"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Network } from "@/lib/contract";
import { money, typologyLabel } from "@/lib/format";
import { NetworkGraph } from "./NetworkGraph";
import { ReviewBadge, TierBadge } from "./TierBadge";

/** The hero visual: the real console in miniature, inside a tinted frame. */
export function ProductWindow() {
  const [nets, setNets] = useState<Network[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [pick, setPick] = useState<string | null>(null);

  useEffect(() => {
    api.networks().then((l) => {
      l.sort((a, b) => a.priority.rank - b.priority.rank);
      setNets(l);
      setPick(l.slice().sort((a, b) => b.metrics.case_count - a.metrics.case_count)[0]?.id ?? null);
    }).catch(() => setFailed(true));
  }, []);

  const sel = nets?.find((n) => n.id === pick) ?? null;
  const list = nets?.slice(0, 6) ?? [];

  return (
    <div className="rounded-[28px] bg-gradient-to-b from-accent-soft to-accent-mid p-3 shadow-[0_40px_90px_-40px_rgba(42,86,240,.45)] md:p-5">
      <div className="overflow-hidden rounded-2xl border border-line bg-bg shadow-sm">
        <div className="flex items-center gap-2 border-b border-line bg-raised px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-line-strong" /><span className="size-2.5 rounded-full bg-line-strong" /><span className="size-2.5 rounded-full bg-line-strong" />
          <span className="mx-auto rounded-md bg-bg px-3 py-0.5 font-mono text-[11px] text-muted">rastro / console</span>
        </div>
        <div className="grid md:grid-cols-[230px_minmax(0,1fr)_260px]">
          <ul className="hidden flex-col gap-1.5 border-r border-line p-3 md:flex">
            <li className="px-1 pb-1 text-xs font-semibold text-muted">Networks, by priority</li>
            {!nets && !failed && [0, 1, 2, 3, 4, 5].map((i) => <li key={i} className="h-11 animate-pulse rounded-lg bg-sunk" />)}
            {list.map((n) => (
              <li key={n.id}>
                <button onClick={() => setPick(n.id)}
                  className={`grid w-full grid-cols-[24px_1fr_auto] items-center gap-2 rounded-lg border px-2.5 py-2 text-left ${n.id === pick ? "border-line-strong bg-raised" : "border-transparent hover:bg-raised"}`}>
                  <span className="font-mono text-[11px] text-muted">#{n.priority.rank}</span>
                  <span className="text-[13px] font-semibold">{n.id}</span>
                  {n.status === "needs_review" ? <ReviewBadge /> : <TierBadge tier={n.priority.tier} />}
                </button>
              </li>
            ))}
          </ul>

          <div className="relative min-h-[320px] md:min-h-[420px]">
            {failed && <p className="p-6 text-sm text-muted">The engine is not reachable. Start it, then reload.</p>}
            {sel && (
              <>
                <div className="absolute left-4 top-3 z-10 flex items-center gap-2 text-sm">
                  <span className="font-semibold">{sel.id}</span>
                  <TierBadge tier={sel.priority.tier} />
                  <span className="text-muted">{typologyLabel[sel.typology.label]}</span>
                </div>
                <NetworkGraph network={sel} highlightEdges={[]} />
              </>
            )}
          </div>

          <div className="hidden border-l border-line p-4 md:block">
            {sel && (
              <div className="flex flex-col gap-3">
                <div className="text-xs font-semibold text-muted">Brief for {sel.id}</div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-xs text-muted">Reports</dt><dd className="font-semibold tabular">{sel.metrics.case_count}</dd></div>
                  <div><dt className="text-xs text-muted">Total loss</dt><dd className="font-semibold tabular">{money(sel.metrics.total_loss)}</dd></div>
                </dl>
                <p className="line-clamp-6 text-[13px] leading-relaxed text-muted">{sel.brief?.summary}</p>
                {sel.brief?.checked && (
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-good-bg px-2.5 py-1 text-xs text-good">
                    <span className="size-1.5 rounded-full bg-good" /> Checked against the links
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
