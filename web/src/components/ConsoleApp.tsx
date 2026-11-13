"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Check, Download, Loader2, Play, RotateCcw, X } from "lucide-react";
import { api, resetDemo } from "@/lib/api";
import type { AuditEvent, Case, LiveEvent, Network } from "@/lib/contract";
import { ago, money, moneyExact, typologyLabel } from "@/lib/format";
import { LIVE_TURNS } from "@/lib/demo";
import { Logo } from "./Logo";
import { NetworkGraph } from "./NetworkGraph";
import { ReviewBadge, TierBadge } from "./TierBadge";
import { AIAgentActivity, type AgentActivityItemData } from "./ui/AIAgentActivity";

const actorLabel: Record<AuditEvent["actor"], string> = {
  code: "Rules (code)", serv: "SERV", shadow: "Shadow agent", human: "Person",
};
const stepLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");

function toActivity(a: AuditEvent): AgentActivityItemData {
  const type: AgentActivityItemData["type"] =
    a.actor === "serv" ? (a.step === "brief" ? "writing" : "thinking")
      : a.actor === "shadow" ? "reading" : "tool_execution";
  return {
    id: a.id,
    type,
    title: `${stepLabel(a.step)} · ${actorLabel[a.actor]}`,
    description: a.summary,
    status: "success",
    duration: `${a.latency_ms} ms`,
    timestamp: new Date(a.created_at).toLocaleTimeString(),
    details: {
      output: {
        object: `${a.object_type} ${a.object_id}`,
        model: a.model ?? "none (plain code)",
        rules: a.rule_ids.length ? a.rule_ids.join(", ") : "none",
        cost_usd: a.cost_usd,
      },
    },
  };
}

type Moved = { from: number; to: number };
type DemoStep = "idle" | "reset" | "chat" | "link" | "rank" | "done" | "error";
type DemoMsg = { from: "bot" | "me"; text: string };

export function ConsoleApp() {
  const [nets, setNets] = useState<Network[] | null>(null);
  const [error, setError] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string[]>([]);
  const [claimIdx, setClaimIdx] = useState<number | null>(null);
  const [cases, setCases] = useState<Case[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [tab, setTab] = useState<"activity" | "reports">("activity");
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [moved, setMoved] = useState<Record<string, Moved>>({});
  const [now, setNow] = useState(() => Date.now());
  const [briefBusy, setBriefBusy] = useState(false);

  // Demo
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoStep, setDemoStep] = useState<DemoStep>("idle");
  const [demoMsgs, setDemoMsgs] = useState<DemoMsg[]>([]);
  const [newCaseIds, setNewCaseIds] = useState<string[]>([]);
  const ranks = useRef<Record<string, number>>({});
  const lastEvent = useRef(0);

  const refresh = useCallback(async (trackMoves = true) => {
    try {
      const list = await api.networks();
      list.sort((a, b) => a.priority.rank - b.priority.rank);
      if (trackMoves) {
        const m: Record<string, Moved> = {};
        for (const n of list) {
          const prev = ranks.current[n.id];
          if (prev !== undefined && prev !== n.priority.rank) m[n.id] = { from: prev, to: n.priority.rank };
        }
        if (Object.keys(m).length) setMoved((o) => ({ ...o, ...m }));
      }
      ranks.current = Object.fromEntries(list.map((n) => [n.id, n.priority.rank]));
      setNets(list);
      setError(false);
      return list;
    } catch {
      setError(true);
      return null;
    }
  }, []);

  const refreshCases = useCallback(() => api.cases(1000).then(setCases).catch(() => {}), []);

  // First load
  useEffect(() => {
    refresh(false).then((l) => { if (l?.length) setSelId((s) => s ?? l[0].id); });
    refreshCases();
    api.events(0).then((e) => { setEvents(e); lastEvent.current = e.at(-1)?.id ?? 0; }).catch(() => {});
    setDemoOpen(new URLSearchParams(window.location.search).get("demo") === "1");
  }, [refresh, refreshCases]);

  // Live events
  useEffect(() => {
    const t = setInterval(async () => {
      setNow(Date.now());
      try {
        const e = await api.events(lastEvent.current);
        if (e.length) {
          lastEvent.current = e.at(-1)!.id;
          setEvents((o) => [...o, ...e].slice(-60));
          if (e.some((x) => x.type !== "case_created")) { refresh(); refreshCases(); }
        }
      } catch {}
    }, 2500);
    return () => clearInterval(t);
  }, [refresh, refreshCases]);

  const sel = useMemo(() => nets?.find((n) => n.id === selId) ?? null, [nets, selId]);
  const netCases = useMemo(() => {
    if (!sel) return [];
    const ids = new Set(sel.case_ids);
    return cases.filter((c) => ids.has(c.id)).sort((a, b) => b.reported_at.localeCompare(a.reported_at));
  }, [sel, cases]);

  // Agent activity for the selected network and its live reports
  useEffect(() => {
    if (!sel) return;
    let stop = false;
    const liveIds = netCases.filter((c) => c.source === "live").map((c) => c.id);
    Promise.all([sel.id, ...liveIds].map((id) => api.audit(id).catch(() => [] as AuditEvent[]))).then((parts) => {
      if (stop) return;
      setAudit(parts.flat().sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)));
    });
    return () => { stop = true; };
  }, [sel, netCases]);

  useEffect(() => { setHighlight([]); setClaimIdx(null); }, [selId]);

  const activities = useMemo(() => audit.map(toActivity), [audit]);
  const latest = events.at(-1);

  async function makeBrief() {
    if (!sel) return;
    setBriefBusy(true);
    try {
      const n = await api.generateBrief(sel.id);
      setNets((o) => o?.map((x) => (x.id === n.id ? n : x)) ?? o);
    } finally { setBriefBusy(false); }
  }

  // ---- Demo script ----
  async function playDemo() {
    setDemoMsgs([]);
    setNewCaseIds([]);
    setMoved({});
    try {
      setDemoStep("reset");
      await resetDemo();
      const list = await refresh(false);
      await refreshCases();
      const e = await api.events(0);
      lastEvent.current = e.at(-1)?.id ?? 0;
      setEvents(e);
      if (list?.length) setSelId(list.find((n) => n.id === "N-007")?.id ?? list[0].id);
      await sleep(900);

      setDemoStep("chat");
      let r = await api.startIntake();
      setDemoMsgs([{ from: "bot", text: r.reply }]);
      await sleep(900);
      for (const t of LIVE_TURNS) {
        if (r.done) break;
        setDemoMsgs((m) => [...m, { from: "me", text: t }]);
        await sleep(700);
        r = await api.sendIntake(r.session_id, t);
        setDemoMsgs((m) => [...m, { from: "bot", text: r.reply }]);
        await sleep(900);
      }
      if (!r.done || !r.case_id) throw new Error("report did not finish");
      setNewCaseIds([r.case_id]);

      setDemoStep("link");
      let final: Network[] | null = null;
      for (let i = 0; i < 25; i++) {
        await sleep(1000);
        final = await refresh(true);
        await refreshCases();
        const c = await api.case(r.case_id).catch(() => null);
        if (c?.network_id) {
          setSelId(c.network_id);
          if (c.status !== "processing" && c.status !== "new") break;
        }
      }
      setDemoStep("rank");
      await sleep(1200);
      final = (await refresh(true)) ?? final;
      setDemoStep("done");
    } catch {
      setDemoStep("error");
    }
  }

  const demoRunning = ["reset", "chat", "link", "rank"].includes(demoStep);

  return (
    <div className="dark flex min-h-screen flex-col bg-bg text-fg lg:h-screen lg:overflow-hidden">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line px-4">
        <Link href="/" aria-label="Rastro home"><Logo className="text-[16px]" /></Link>
        <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-line bg-bg-raised px-3 py-1.5 font-mono text-xs text-muted">
          <span className="live-dot size-2 shrink-0 rounded-full bg-p1" aria-hidden="true" />
          <span className="truncate" aria-live="polite">{latest ? latest.message : "Waiting for events"}</span>
          {latest && <span className="ml-auto hidden shrink-0 text-faint sm:inline">{ago(latest.at, now)}</span>}
        </div>
        <button onClick={() => setDemoOpen((o) => !o)}
          className="inline-flex items-center gap-2 rounded-full bg-fg px-4 py-1.5 text-sm font-medium text-bg transition-transform hover:-translate-y-px">
          <Play className="size-3.5" /> Live demo
        </button>
        <Link href="/report" className="hidden text-sm text-muted hover:text-fg md:inline">Report page</Link>
      </header>

      {error && (
        <div role="alert" className="border-b border-line bg-p1-bg px-4 py-2 text-sm text-p1">
          The Rastro engine is not reachable. Start it on port 8000, then reload this page.
        </div>
      )}

      {/* Main */}
      <div className="grid min-h-0 flex-1 lg:grid-cols-[300px_minmax(0,1fr)_380px]">
        {/* Networks list */}
        <aside className="flex min-h-0 flex-col border-b border-line lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between px-4 pb-2 pt-4">
            <h2 className="text-sm font-semibold">Networks, by priority</h2>
            <span className="font-mono text-xs text-muted">{nets?.length ?? "…"}</span>
          </div>
          <ul className="flex max-h-[320px] flex-col gap-1.5 overflow-y-auto px-3 pb-3 lg:max-h-none lg:flex-1">
            {!nets && !error && Array.from({ length: 7 }).map((_, i) => <li key={i} className="h-[58px] animate-pulse rounded-xl bg-bg-raised" />)}
            {nets?.map((n) => {
              const mv = moved[n.id];
              const active = n.id === selId;
              return (
                <motion.li layout transition={{ type: "spring", stiffness: 260, damping: 30 }} key={n.id}>
                  <button
                    onClick={() => setSelId(n.id)}
                    aria-current={active ? "true" : undefined}
                    className={`grid w-full grid-cols-[30px_1fr_auto] items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      active ? "border-line-strong bg-bg-raised" : "border-transparent hover:bg-bg-raised/60"
                    }`}
                  >
                    <span className="font-mono text-xs text-muted tabular">#{n.priority.rank}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{n.id}</span>
                      <span className="block truncate text-xs text-muted">
                        {typologyLabel[n.typology.label]} · {n.metrics.case_count} reports
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      {n.status === "needs_review" ? <ReviewBadge /> : <TierBadge tier={n.priority.tier} />}
                      {mv && mv.to < mv.from && (
                        <span className="flex items-center gap-0.5 font-mono text-[10px] text-good"><ArrowUp className="size-3" />from #{mv.from}</span>
                      )}
                    </span>
                  </button>
                </motion.li>
              );
            })}
          </ul>
        </aside>

        {/* Centre: summary + graph */}
        <section className="flex min-h-[420px] min-w-0 flex-col lg:min-h-0">
          {sel ? (
            <>
              <div className="flex flex-wrap items-end gap-x-8 gap-y-3 border-b border-line px-5 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-semibold tracking-tight">{sel.id}</h1>
                    {sel.status === "needs_review" ? <ReviewBadge /> : <TierBadge tier={sel.priority.tier} />}
                    <span className="text-sm text-muted">{typologyLabel[sel.typology.label]}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">Rank #{sel.priority.rank} · score {sel.priority.score.toFixed(1)} · {sel.priority.rule_ids.join(", ") || "no rules fired"}</p>
                </div>
                <dl className="ml-auto flex gap-6 text-sm">
                  <Metric label="Reports" value={String(sel.metrics.case_count)} />
                  <Metric label="Total loss" value={money(sel.metrics.total_loss)} />
                  <Metric label="Last 7 days" value={String(sel.metrics.cases_last_7d)} />
                </dl>
              </div>
              <div className="relative min-h-[300px] flex-1 bg-[radial-gradient(ellipse_at_center,rgba(91,130,255,.06),transparent_70%)]">
                <NetworkGraph network={sel} highlightEdges={highlight} newCaseIds={newCaseIds.map((id) => id)} />
              </div>
            </>
          ) : (
            <div className="grid flex-1 place-items-center p-10 text-sm text-muted">{error ? "No data." : "Loading networks"}</div>
          )}
        </section>

        {/* Brief */}
        <aside className="min-h-0 overflow-y-auto border-t border-line p-5 lg:border-l lg:border-t-0">
          {sel && <BriefPanel net={sel} claimIdx={claimIdx} onClaim={(i, ids) => { const same = claimIdx === i; setClaimIdx(same ? null : i); setHighlight(same ? [] : ids); }} onMake={makeBrief} busy={briefBusy} />}
        </aside>
      </div>

      {/* Bottom: agent activity and reports */}
      <section className="h-[300px] shrink-0 border-t border-line">
        <div className="flex h-11 items-center gap-1 border-b border-line px-3">
          {(["activity", "reports"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-sm ${tab === t ? "bg-bg-raised text-fg" : "text-muted hover:text-fg"}`}>
              {t === "activity" ? "Agent activity" : `Reports${sel ? ` (${netCases.length})` : ""}`}
            </button>
          ))}
          <span className="ml-auto hidden text-xs text-faint md:inline">
            {tab === "activity" ? "Every step the pipeline took, and who did it: rules in code, SERV, or the shadow agent." : "Reports that belong to this network, newest first."}
          </span>
        </div>
        <div className="h-[calc(300px-44px)] overflow-y-auto p-4">
          {tab === "activity" ? (
            activities.length ? (
              <AIAgentActivity activities={activities} title="Agent activity" agentName={sel ? `Rastro pipeline · ${sel.id}` : "Rastro pipeline"} isRunning={demoRunning} />
            ) : <p className="text-sm text-muted">No recorded steps for this network yet.</p>
          ) : (
            <ReportsTable cases={netCases} />
          )}
        </div>
      </section>

      <AnimatePresence>
        {demoOpen && (
          <DemoPanel step={demoStep} msgs={demoMsgs} running={demoRunning} onPlay={playDemo}
            onClose={() => setDemoOpen(false)} netMove={moved["N-007"]} />
        )}
      </AnimatePresence>
    </div>
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-semibold tabular">{value}</dd>
    </div>
  );
}

function BriefPanel({
  net, claimIdx, onClaim, onMake, busy,
}: {
  net: Network; claimIdx: number | null;
  onClaim: (i: number, edgeIds: string[]) => void; onMake: () => void; busy: boolean;
}) {
  const b = net.brief;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Brief for {net.id}</h2>
        {b?.checked && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-good-bg px-2.5 py-1 text-xs text-good"><Check className="size-3" /> Checked</span>
        )}
        {net.status === "needs_review" && <span className="rounded-full border border-dashed border-line-strong px-2.5 py-1 text-xs text-muted">Needs a person</span>}
      </div>

      {net.priority.reasons.length > 0 && (
        <ul className="flex flex-col gap-1.5 rounded-xl border border-line bg-bg-raised p-3 text-[13px] leading-snug text-muted">
          {net.priority.reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
      )}

      {!b ? (
        <div className="rounded-xl border border-dashed border-line-strong p-4">
          <p className="text-sm text-muted">No brief has been written for this network yet.</p>
          <button onClick={onMake} disabled={busy}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-fg px-4 py-2 text-sm font-medium text-bg disabled:opacity-60">
            {busy && <Loader2 className="size-4 animate-spin" />} Write the brief
          </button>
        </div>
      ) : (
        <>
          <p className="text-[14px] leading-relaxed text-fg/90">{b.summary}</p>

          <div>
            <h3 className="text-xs font-semibold text-muted">Why these reports are linked</h3>
            <p className="mt-0.5 text-xs text-faint">Select a reason to light up its links in the graph.</p>
            <ul className="mt-2 flex flex-col gap-2">
              {b.why_linked.map((c, i) => (
                <li key={i}>
                  <button onClick={() => onClaim(i, c.edge_ids)} aria-pressed={claimIdx === i}
                    className={`w-full rounded-xl border px-3 py-2.5 text-left text-[13px] leading-snug transition-colors ${
                      claimIdx === i ? "border-accent bg-accent/10" : "border-line bg-bg-raised hover:border-line-strong"
                    }`}>
                    {c.claim}
                    <span className="mt-1 block font-mono text-[11px] text-faint">{c.edge_ids.length} link{c.edge_ids.length === 1 ? "" : "s"}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {b.gaps.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted">What is not known</h3>
              <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4 text-[13px] text-muted">{b.gaps.map((g) => <li key={g}>{g}</li>)}</ul>
            </div>
          )}
          {b.next_steps.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted">Suggested next steps</h3>
              <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-4 text-[13px]">{b.next_steps.map((g) => <li key={g}>{g}</li>)}</ol>
              <p className="mt-2 text-xs text-faint">A person decides. Rastro does not act on accounts.</p>
            </div>
          )}
          {b.check_notes.length > 0 && !b.checked && (
            <div className="rounded-xl bg-p2-bg p-3 text-[13px] text-p2">
              <div className="font-medium">Checks that failed</div>
              <ul className="mt-1 list-disc pl-4">{b.check_notes.map((n) => <li key={n}>{n}</li>)}</ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ReportsTable({ cases }: { cases: Case[] }) {
  if (!cases.length) return <p className="text-sm text-muted">No reports to show.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="text-xs text-muted">
          <tr>
            <th className="pb-2 font-medium">Report</th><th className="pb-2 font-medium">Amount</th>
            <th className="pb-2 font-medium">Channel</th><th className="pb-2 font-medium">Urgency</th>
            <th className="pb-2 font-medium">Flags</th><th className="pb-2 text-right font-medium">Packet</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {cases.slice(0, 60).map((c) => (
            <tr key={c.id}>
              <td className="py-2 pr-4"><span className="font-mono text-xs">{c.id}</span>{c.source === "live" && <span className="ml-2 rounded bg-p1-bg px-1.5 py-0.5 text-[10px] text-p1">live</span>}</td>
              <td className="py-2 pr-4 tabular">{moneyExact(c.amount)}</td>
              <td className="py-2 pr-4 text-muted">{c.channel}</td>
              <td className="py-2 pr-4"><TierBadge tier={c.urgency.tier} /></td>
              <td className="py-2 pr-4 text-xs text-muted">{c.flags.length ? c.flags.map((f) => f.replace(/_/g, " ")).join(", ") : "none"}</td>
              <td className="py-2 text-right">
                <a href={api.packetUrl(c.id)} className="inline-flex items-center gap-1 text-xs text-accent hover:underline"><Download className="size-3" /> PDF</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const demoSteps: { key: DemoStep[]; label: string }[] = [
  { key: ["reset"], label: "Reset to the starting data" },
  { key: ["chat"], label: "A victim reports a $2,400 scam" },
  { key: ["link"], label: "Rastro links it to an existing network" },
  { key: ["rank", "done"], label: "The network moves up the ranking" },
];

function DemoPanel({
  step, msgs, running, onPlay, onClose, netMove,
}: { step: DemoStep; msgs: DemoMsg[]; running: boolean; onPlay: () => void; onClose: () => void; netMove?: Moved }) {
  const order: DemoStep[] = ["idle", "reset", "chat", "link", "rank", "done"];
  const at = order.indexOf(step);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" }); }, [msgs]);

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
      className="fixed bottom-4 right-4 z-40 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-4 rounded-2xl border border-line-strong bg-bg-raised p-5 shadow-2xl"
      role="dialog" aria-label="Live demo">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Live demo</h2>
          <p className="mt-0.5 text-sm text-muted">File a new report and watch the ranking change.</p>
        </div>
        <button onClick={onClose} aria-label="Close demo" className="rounded-md p-1 text-muted hover:text-fg"><X className="size-4" /></button>
      </div>

      <ol className="flex flex-col gap-2 text-sm">
        {demoSteps.map((s, i) => {
          const idx = Math.max(...s.key.map((k) => order.indexOf(k)));
          const first = Math.min(...s.key.map((k) => order.indexOf(k)));
          const isDone = at > idx || step === "done";
          const isNow = at >= first && at <= idx && step !== "done";
          return (
            <li key={i} className={`flex items-center gap-2.5 ${isDone || isNow ? "text-fg" : "text-faint"}`}>
              <span className="grid size-5 place-items-center">
                {isDone ? <Check className="size-4 text-good" /> : isNow ? <Loader2 className="size-4 animate-spin text-accent" /> : <span className="size-1.5 rounded-full bg-faint" />}
              </span>
              {s.label}
            </li>
          );
        })}
      </ol>

      {msgs.length > 0 && (
        <div ref={box} className="flex max-h-44 flex-col gap-2 overflow-y-auto rounded-xl border border-line bg-bg p-3">
          {msgs.map((m, i) => (
            <p key={i} className={`max-w-[88%] rounded-xl px-3 py-1.5 text-[13px] leading-snug ${
              m.from === "me" ? "self-end bg-fg text-bg" : "self-start bg-bg-raised text-muted"
            }`}>{m.text}</p>
          ))}
        </div>
      )}

      {step === "done" && netMove && (
        <p className="rounded-xl bg-good-bg px-3 py-2 text-sm text-good">N-007 moved from #{netMove.from} to #{netMove.to}.</p>
      )}
      {step === "done" && !netMove && (
        <p className="rounded-xl bg-bg px-3 py-2 text-sm text-muted">The report is filed. Check the list for any change in rank.</p>
      )}
      {step === "error" && (
        <p role="alert" className="rounded-xl bg-p1-bg px-3 py-2 text-sm text-p1">The demo stopped. Check that the engine is running, then play it again.</p>
      )}

      <button onClick={onPlay} disabled={running}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-fg px-5 py-2.5 text-sm font-medium text-bg transition-transform hover:-translate-y-px disabled:opacity-60">
        {running ? <><Loader2 className="size-4 animate-spin" /> Running</> : step === "idle" ? <><Play className="size-4" /> Play the demo</> : <><RotateCcw className="size-4" /> Play again</>}
      </button>
      <p className="text-xs text-faint">Playing resets the demo data first. All data is synthetic.</p>
    </motion.div>
  );
}
