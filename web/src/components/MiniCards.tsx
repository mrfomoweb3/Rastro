"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Network } from "@/lib/contract";
import { LIVE_TURNS } from "@/lib/demo";

const card = "flex flex-col gap-4 overflow-hidden rounded-2xl border border-line bg-bg-raised p-6";

export function MiniChat() {
  const bubbles = [
    { me: true, t: LIVE_TURNS[0] },
    { me: false, t: "How much money did you send, in US dollars?" },
    { me: true, t: LIVE_TURNS[1] },
  ];
  return (
    <div className={card}>
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-bg p-3">
        {bubbles.map((b, i) => (
          <p key={i} className={`max-w-[88%] rounded-xl px-3 py-2 text-[12.5px] leading-snug ${b.me ? "self-end bg-fg text-bg" : "self-start border border-line bg-bg-raised"}`}>{b.t}</p>
        ))}
      </div>
      <div>
        <h3 className="text-lg font-semibold tracking-tight">Collects the report in a chat</h3>
        <p className="mt-1 text-[15px] text-muted">Victims answer in their own words. No form, no account.</p>
      </div>
    </div>
  );
}

export function MiniGraph() {
  const spokes = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return { x: Math.round((150 + Math.cos(a) * 62) * 10) / 10, y: Math.round((70 + Math.sin(a) * 50) * 10) / 10 };
  });
  return (
    <div className={card}>
      <div className="rounded-xl border border-line bg-bg p-3">
        <svg viewBox="0 0 300 140" className="h-[124px] w-full" role="img" aria-label="Reports joined by one shared account">
          {spokes.map((s, i) => <line key={i} x1="150" y1="70" x2={s.x} y2={s.y} stroke="var(--accent)" strokeOpacity=".4" />)}
          {spokes.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r="4" fill="var(--fg)" fillOpacity=".85" />)}
          <rect x="140" y="60" width="20" height="20" rx="5" fill="var(--accent)" />
          <text x="150" y="102" textAnchor="middle" fontSize="9" fontFamily="var(--font-geist-mono), monospace" fill="var(--muted)">one shared account</text>
        </svg>
      </div>
      <div>
        <h3 className="text-lg font-semibold tracking-tight">Links reports that share details</h3>
        <p className="mt-1 text-[15px] text-muted">An account, phone or link joins reports. A similar name never does.</p>
      </div>
    </div>
  );
}

export function MiniBrief() {
  const [net, setNet] = useState<Network | null>(null);
  useEffect(() => {
    api.networks().then((l) => setNet(l.filter((n) => n.brief).sort((a, b) => b.metrics.case_count - a.metrics.case_count)[0] ?? null)).catch(() => {});
  }, []);
  const claim = net?.brief?.why_linked[0]?.claim;
  return (
    <div className={card}>
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-bg p-3 text-[12.5px] leading-snug">
        <div className="flex items-center justify-between">
          <span className="font-semibold">Why these reports are linked</span>
          <span className="rounded-full bg-good-bg px-2 py-0.5 text-[11px] text-good">Checked</span>
        </div>
        <p className="rounded-lg border border-line bg-bg-raised p-2 text-muted">{claim ?? "40 reports paid into the same receiving account."}</p>
        <p className="font-mono text-[11px] text-faint">Each claim points to the links that prove it.</p>
      </div>
      <div>
        <h3 className="text-lg font-semibold tracking-tight">Explains why, not only a score</h3>
        <p className="mt-1 text-[15px] text-muted">Every claim in a brief is checked against the graph before anyone reads it.</p>
      </div>
    </div>
  );
}
