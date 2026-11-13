"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Stats } from "@/lib/contract";
import { AnimatedNumber } from "./ui/AnimatedNumber";

export function useStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    api.stats().then(setStats).catch(() => {});
  }, []);
  return stats;
}

export function HeroFact() {
  const s = useStats();
  if (!s) return <p className="h-5 font-mono text-[13px] text-faint">&nbsp;</p>;
  return (
    <p className="font-mono text-[13px] text-muted">
      <span className="text-fg">{s.cases_total}</span> reports linked into <span className="text-fg">{s.networks_total}</span> networks. All data is synthetic.
    </p>
  );
}

export function StatsRow() {
  const s = useStats();
  const items = [
    { v: s?.cases_total ?? 0, label: "reports read", decimals: 0, suffix: "" },
    { v: s?.networks_total ?? 0, label: "networks found", decimals: 0, suffix: "" },
    { v: s?.avg_seconds_report_to_packet ?? 0, label: "seconds from report to packet", decimals: 2, suffix: "" },
    { v: s?.analyst_hours_saved ?? 0, label: "analyst hours saved (estimate)", decimals: 0, suffix: "" },
  ];
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-accent-mid/70 md:grid-cols-4">
      {items.map((i) => (
        <div key={i.label} className="flex flex-col gap-2 bg-bg/70 px-6 py-9">
          <dt className="order-2 text-sm text-muted">{i.label}</dt>
          <dd className="order-1 text-4xl font-semibold tracking-tight tabular md:text-5xl">
            <AnimatedNumber value={i.v} decimals={i.decimals} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
