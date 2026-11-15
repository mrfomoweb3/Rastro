"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUp, Banknote, Bot, Check, CircleHelp, Clock, Download, FileText, Fish, Globe, Heart, Hourglass, Inbox,
  Landmark, Layers, Loader2, Mail, MessageSquareWarning, Network as NetworkIcon, Pause, PenLine, Phone, Play, RotateCcw,
  Search, ShieldCheck, TrendingUp, TriangleAlert, UserCheck, VenetianMask, Wallet, X, type LucideProps,
  LogOut, ThumbsUp, ThumbsDown, ArrowDown, FileJson, FileSpreadsheet, LockKeyhole, Building2,
} from "lucide-react";
import { api, AuthError, resetDemo } from "@/lib/api";
import type { AuditEvent, Case, FeedbackIn, LiveEvent, Network, Stats, Team } from "@/lib/contract";
import { ago, channelLabel, money, moneyExact, typologyLabel } from "@/lib/format";
import { actorText, plain, stepDetail, stepTitle } from "@/lib/plain";
import { LIVE_TURNS } from "@/lib/demo";
import { Logo } from "./Logo";
import { NetworkGraph } from "./NetworkGraph";
import { ReviewBadge, TierBadge } from "./TierBadge";

type Icon = ComponentType<LucideProps>;
const typologyIcon: Record<string, Icon> = {
  mule_network: Banknote, investment_ring: TrendingUp, impersonation_ring: VenetianMask,
  romance_ring: Heart, phishing_kit: Fish, mixed: Layers, unknown: CircleHelp,
};
const claimIcon = (claim: string): Icon =>
  /account/i.test(claim) ? Landmark : /phone/i.test(claim) ? Phone : /website|link/i.test(claim) ? Globe
    : /email/i.test(claim) ? Mail : /wallet/i.test(claim) ? Wallet : NetworkIcon;
const compactMoney = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(n);
const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

type Moved = { from: number; to: number };
type DemoStep = "idle" | "reset" | "chat" | "link" | "rank" | "done" | "error";
type DemoMsg = { from: "bot" | "me"; text: string };
type Filter = "all" | "urgent" | "review";

/** Analyst console behind a team login. */
export function ConsoleApp() {
  const [team, setTeam] = useState<Team | null | undefined>(undefined);
  useEffect(() => {
    api.me().then(setTeam).catch(() => setTeam(null));
  }, []);
  if (team === undefined) {
    return <div className="grid min-h-screen place-items-center bg-bg-raised text-sm text-muted"><Loader2 className="size-5 animate-spin" /></div>;
  }
  if (team === null) return <Login onIn={setTeam} />;
  return <Console key={team.slug} team={team} onSignOut={() => { api.logout().catch(() => {}); setTeam(null); }} />;
}

function Login({ onIn }: { onIn: (t: Team) => void }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [slug, setSlug] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api.teams().then((t) => { setTeams(t); setSlug((s) => s || t[0]?.slug || ""); })
      .catch(() => setErr("Can't reach the Rastro engine. Try again in a moment."));
  }, []);
  async function go(team: string, pw: string) {
    setBusy(true); setErr(null);
    try { onIn(await api.login(team, pw)); }
    catch (e) { setErr(e instanceof AuthError ? "Wrong team or password." : "Sign-in failed. Try again."); }
    finally { setBusy(false); }
  }
  const hasDemo = teams.some((t) => t.slug === "demo");
  return (
    <div className="grid min-h-screen place-items-center bg-bg-raised px-4">
      <div className="w-full max-w-sm">
        <Link href="/" aria-label="Rastro home" className="mb-6 flex justify-center"><Logo className="text-[18px]" /></Link>
        <form onSubmit={(e) => { e.preventDefault(); go(slug, password); }}
          className="rounded-2xl border border-line bg-bg p-6 shadow-[0_1px_2px_rgba(16,24,40,.04)]">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-accent-soft text-accent"><LockKeyhole className="size-4" /></span>
            <h1 className="text-base font-semibold">Sign in to the fraud console</h1>
          </div>
          <p className="mt-2 text-sm text-muted">Each fraud team has its own login. Your team&apos;s feedback and exports stay private to your team.</p>
          <label className="mt-5 block text-xs font-medium text-muted" htmlFor="team">Team</label>
          <div className="mt-1 flex items-center gap-2 rounded-lg border border-line px-2.5 focus-within:border-accent">
            <Building2 className="size-4 text-faint" />
            <select id="team" value={slug} onChange={(e) => setSlug(e.target.value)} className="w-full bg-transparent py-2 text-sm outline-none">
              {teams.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
            </select>
          </div>
          <label className="mt-3 block text-xs font-medium text-muted" htmlFor="pw">Password</label>
          <input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
            className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-accent" />
          {err && <p role="alert" className="mt-3 rounded-lg bg-p1-bg px-3 py-2 text-sm text-p1">{err}</p>}
          <button type="submit" disabled={busy || !slug || !password}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-fg px-4 py-2 text-sm font-medium text-bg disabled:opacity-50">
            {busy && <Loader2 className="size-4 animate-spin" />} Sign in
          </button>
          {hasDemo && (
            <>
              <button type="button" disabled={busy} onClick={() => go("demo", "demo")}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:brightness-110 disabled:opacity-50">
                <Play className="size-3.5" /> Continue as the demo team
              </button>
              <p className="mt-3 text-center text-xs text-faint">Demo team password: <span className="font-mono">demo</span>. All data is synthetic.</p>
            </>
          )}
        </form>
      </div>
    </div>
  );
}

function Console({ team, onSignOut }: { team: Team; onSignOut: () => void }) {
  const [nets, setNets] = useState<Network[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);
  const [selId, setSelIdRaw] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string[]>([]);
  const [claimIdx, setClaimIdx] = useState<number | null>(null);
  const [autoPlay, setAutoPlay] = useState(false);
  const [cases, setCases] = useState<Case[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [tab, setTab] = useState<"reports" | "activity">("reports");
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [moved, setMoved] = useState<Record<string, Moved>>({});
  const [now, setNow] = useState(() => Date.now());
  const [briefBusy, setBriefBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const [demoOpen, setDemoOpen] = useState(false);
  const [demoStep, setDemoStep] = useState<DemoStep>("idle");
  const [demoMsgs, setDemoMsgs] = useState<DemoMsg[]>([]);
  const [newCaseIds, setNewCaseIds] = useState<string[]>([]);
  const selRef = useRef<string | null>(null);
  const setSelId = useCallback((next: string | null | ((s: string | null) => string | null)) => {
    const id = typeof next === "function" ? next(selRef.current) : next;
    if (id === selRef.current) return;
    selRef.current = id;
    setSelIdRaw(id);
    setHighlight([]); setClaimIdx(null); setAutoPlay(false);
  }, []);
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
      api.stats().then(setStats).catch(() => {});
      return list;
    } catch (e) {
      if (e instanceof AuthError) onSignOut(); else setError(true);
      return null;
    }
  }, [onSignOut]);

  const refreshCases = useCallback(() => api.cases(1000).then(setCases).catch(() => {}), []);

  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get("network");
    refresh(false).then((l) => { if (l?.length) setSelId((s) => s ?? (l.find((n) => n.id === want) ?? l[0]).id); });
    refreshCases();
    api.events(0).then((e) => { setEvents(e); lastEvent.current = e.at(-1)?.id ?? 0; }).catch(() => {});
    setDemoOpen(new URLSearchParams(window.location.search).get("demo") === "1");
  }, [refresh, refreshCases, setSelId]);

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

  const claims = sel?.brief?.why_linked;
  useEffect(() => {
    if (!autoPlay || !claims?.length) return;
    let i = 0;
    const show = () => { setClaimIdx(i); setHighlight(claims[i].edge_ids); i = (i + 1) % claims.length; };
    show();
    const t = setInterval(show, 3000);
    return () => clearInterval(t);
  }, [autoPlay, claims, selId]);

  const netCases = useMemo(() => {
    if (!sel) return [];
    const ids = new Set(sel.case_ids);
    return cases.filter((c) => ids.has(c.id)).sort((a, b) => b.reported_at.localeCompare(a.reported_at));
  }, [sel, cases]);

  useEffect(() => {
    if (!sel) return;
    let stop = false;
    const liveIds = netCases.filter((c) => c.source === "live").map((c) => c.id);
    Promise.all([sel.id, ...liveIds].map((id) => api.audit(id).catch(() => [] as AuditEvent[]))).then((parts) => {
      if (stop) return;
      setAudit(parts.flat().sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)));
    });
    return () => { stop = true; };
  }, [sel, netCases]);


  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (nets ?? []).filter((n) =>
      (filter === "all" || (filter === "urgent" ? n.priority.tier === "P1" : n.status === "needs_review"))
      && (!q || n.id.toLowerCase().includes(q) || typologyLabel[n.typology.label].toLowerCase().includes(q)));
  }, [nets, query, filter]);

  const totalLoss = useMemo(() => (nets ?? []).reduce((s, n) => s + n.metrics.total_loss, 0), [nets]);
  const urgentCount = (nets ?? []).filter((n) => n.priority.tier === "P1").length;
  const reviewCount = (nets ?? []).filter((n) => n.status === "needs_review").length;
  const latest = events.at(-1);
  const latestPacket = netCases.find((c) => c.packet_url);

  async function makeBrief() {
    if (!sel) return;
    setBriefBusy(true);
    try {
      const n = await api.generateBrief(sel.id);
      setNets((o) => o?.map((x) => (x.id === n.id ? n : x)) ?? o);
    } finally { setBriefBusy(false); }
  }

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
      for (let i = 0; i < 25; i++) {
        await sleep(1000);
        await refresh(true);
        await refreshCases();
        const c = await api.case(r.case_id).catch(() => null);
        if (c?.network_id) {
          setSelId(c.network_id);
          if (c.status !== "processing" && c.status !== "new") break;
        }
      }
      setDemoStep("rank");
      await sleep(1200);
      await refresh(true);
      setDemoStep("done");
    } catch {
      setDemoStep("error");
    }
  }

  const demoRunning = ["reset", "chat", "link", "rank"].includes(demoStep);

  return (
    <div className="flex min-h-screen flex-col bg-bg-raised text-fg lg:h-screen lg:overflow-hidden">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-bg px-4">
        <Link href="/" aria-label="Rastro home"><Logo className="text-[16px]" /></Link>
        <span className="hidden h-5 w-px bg-line sm:block" />
        <span className="hidden text-sm font-medium text-muted sm:block">Fraud console</span>
        <div className="mx-2 hidden min-w-0 flex-1 items-center gap-2 text-xs text-muted md:flex" aria-live="polite">
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-good-bg px-2 py-0.5 font-medium text-good">
            <span className="size-1.5 rounded-full bg-good live-dot-good" /> Live
          </span>
          {latest && <span className="truncate">{plain(latest.message)} <span className="text-faint">· {ago(latest.at, now)}</span></span>}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-lg bg-bg-raised px-2.5 py-1.5 text-xs text-muted lg:inline-flex" title="Signed in team">
            <Building2 className="size-3.5" /> {team.name}
          </span>
          <button onClick={onSignOut} aria-label="Sign out" title="Sign out"
            className="grid size-8 place-items-center rounded-lg border border-line text-muted hover:bg-bg-raised hover:text-fg"><LogOut className="size-4" /></button>
          <Link href="/report" className="hidden items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm text-fg hover:bg-bg-raised sm:inline-flex">
            <MessageSquareWarning className="size-4 text-muted" /> Report a scam
          </Link>
          <button onClick={() => setDemoOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-on-accent hover:brightness-110">
            <Play className="size-3.5" /> Live demo
          </button>
        </div>
      </header>

      {error && (
        <div role="alert" className="flex items-center gap-2 border-b border-line bg-p1-bg px-4 py-2 text-sm text-p1">
          <TriangleAlert className="size-4" /> Can&apos;t reach the Rastro engine. Start it on port 8000, then reload.
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* Priority queue */}
        <aside className="flex min-h-0 flex-col border-b border-line bg-bg lg:border-b-0 lg:border-r">
          <div className="space-y-3 border-b border-line p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Priority queue</h2>
              <span className="rounded-full bg-bg-raised px-2 py-0.5 text-xs text-muted tabular">{nets?.length ?? "…"} networks</span>
            </div>
            <label className="flex items-center gap-2 rounded-lg border border-line bg-bg px-2.5 py-1.5 focus-within:border-accent">
              <Search className="size-4 text-faint" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search networks"
                className="w-full bg-transparent text-sm outline-none placeholder:text-faint" aria-label="Search networks" />
            </label>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-bg-raised p-1 text-xs" role="tablist" aria-label="Filter networks">
              {([["all", "All", nets?.length], ["urgent", "Urgent", urgentCount], ["review", "Review", reviewCount]] as const).map(([k, label, n]) => (
                <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}
                  className={`rounded-md px-2 py-1 font-medium transition-colors ${filter === k ? "bg-bg text-fg shadow-sm" : "text-muted hover:text-fg"}`}>
                  {label} <span className="text-faint tabular">{n ?? ""}</span>
                </button>
              ))}
            </div>
          </div>
          <ul className="flex max-h-[360px] flex-col overflow-y-auto p-2 lg:max-h-none lg:flex-1">
            {!nets && !error && Array.from({ length: 8 }).map((_, i) => <li key={i} className="m-1 h-[60px] animate-pulse rounded-lg bg-bg-raised" />)}
            {nets && !shown.length && <li className="p-6 text-center text-sm text-muted">No networks match.</li>}
            {shown.map((n) => {
              const mv = moved[n.id];
              const active = n.id === selId;
              const TIcon = typologyIcon[n.typology.label] ?? CircleHelp;
              return (
                <motion.li layout transition={{ type: "spring", stiffness: 260, damping: 30 }} key={n.id}>
                  <button onClick={() => setSelId(n.id)} aria-current={active ? "true" : undefined}
                    className={`relative grid w-full grid-cols-[28px_32px_1fr_auto] items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors ${
                      active ? "bg-accent-soft" : "hover:bg-bg-raised"}`}>
                    {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" />}
                    <span className="text-center text-xs font-medium text-muted tabular">{n.priority.rank}</span>
                    <span className={`grid size-8 place-items-center rounded-lg ${active ? "bg-bg text-accent" : "bg-bg-raised text-muted"}`}><TIcon className="size-4" /></span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        {n.id} <span className="truncate font-normal text-muted">{typologyLabel[n.typology.label]}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted tabular">
                        {n.metrics.case_count} reports · {money(n.metrics.total_loss)}
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      {n.status === "needs_review" ? <ReviewBadge /> : <TierBadge tier={n.priority.tier} />}
                      {mv && mv.to < mv.from && (
                        <span className="flex items-center gap-0.5 text-[11px] font-medium text-good"><ArrowUp className="size-3" />{mv.from - mv.to}</span>
                      )}
                    </span>
                  </button>
                </motion.li>
              );
            })}
          </ul>
        </aside>

        {/* Detail */}
        <main className="min-h-0 min-w-0 space-y-4 overflow-y-auto p-4 lg:p-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Kpi icon={Inbox} label="Reports received" value={stats ? stats.cases_total.toLocaleString() : "…"} note="All synthetic data" />
            <Kpi icon={NetworkIcon} label="Networks found" value={nets ? String(nets.length) : "…"} note={`${urgentCount} urgent · ${reviewCount} need review`} />
            <Kpi icon={Banknote} label="Reported losses" value={nets ? compactMoney(totalLoss) : "…"} note="Across all networks" />
            <Kpi icon={Hourglass} label="Analyst hours saved" value={stats ? Math.round(stats.analyst_hours_saved).toLocaleString() : "…"}
              note={stats ? (stats.avg_seconds_report_to_packet < 1 ? "Packets ready in under a second" : `Packets ready in ${Math.round(stats.avg_seconds_report_to_packet)} s`) : ""} />
          </div>

          {sel ? (
            <>
              <NetworkHeader net={sel} total={nets?.length ?? 0} moved={moved[sel.id]} packetCase={latestPacket} />

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <Card className="flex flex-col">
                  <CardHead title="Link map" sub="Reports joined by a shared account, phone or link. Drag to move, hover for details." />
                  <div className="relative h-[460px] flex-1 border-t border-line">
                    <NetworkGraph network={sel} highlightEdges={highlight} newCaseIds={newCaseIds} cases={netCases} />
                  </div>
                </Card>
                <Card className="p-5 xl:max-h-[620px] xl:overflow-y-auto">
                  <BriefPanel net={sel} claimIdx={claimIdx} autoPlay={autoPlay}
                    onToggleAuto={() => setAutoPlay((a) => { if (a) { setClaimIdx(null); setHighlight([]); } return !a; })}
                    onClaim={(i, ids) => { setAutoPlay(false); const same = claimIdx === i; setClaimIdx(same ? null : i); setHighlight(same ? [] : ids); }}
                    onMake={makeBrief} busy={briefBusy} />
                  <FeedbackPanel net={sel} team={team} />
                </Card>
              </div>

              <Card>
                <div className="flex items-center gap-1 border-b border-line px-3" role="tablist">
                  {(["reports", "activity"] as const).map((t) => (
                    <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                      className={`-mb-px border-b-2 px-3 py-3 text-sm font-medium transition-colors ${tab === t ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"}`}>
                      {t === "reports" ? <>Reports <span className="ml-1 rounded-full bg-bg-raised px-1.5 py-0.5 text-xs text-muted tabular">{netCases.length}</span></> : "Activity"}
                    </button>
                  ))}
                </div>
                <div className="max-h-[420px] overflow-y-auto">
                  {tab === "reports" ? <ReportsTable cases={netCases} /> : <ActivityList items={audit} running={demoRunning} />}
                </div>
              </Card>
            </>
          ) : (
            <Card className="grid h-64 place-items-center text-sm text-muted">
              {error ? "No data." : <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Loading networks</span>}
            </Card>
          )}
        </main>
      </div>

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

function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <section className={`overflow-hidden rounded-xl border border-line bg-bg shadow-[0_1px_2px_rgba(16,24,40,.04)] ${className}`}>{children}</section>;
}

function CardHead({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

function Kpi({ icon: I, label, value, note }: { icon: Icon; label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-line bg-bg p-4 shadow-[0_1px_2px_rgba(16,24,40,.04)]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        <span className="grid size-7 place-items-center rounded-lg bg-accent-soft text-accent"><I className="size-4" /></span>
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular">{value}</div>
      {note && <div className="mt-0.5 truncate text-xs text-faint">{note}</div>}
    </div>
  );
}

function NetworkHeader({ net, total, moved, packetCase }: { net: Network; total: number; moved?: Moved; packetCase?: Case }) {
  const TIcon = typologyIcon[net.typology.label] ?? CircleHelp;
  const m = net.metrics;
  return (
    <Card>
      <div className="flex flex-wrap items-start gap-4 p-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><TIcon className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">{net.id}</h1>
            <span className="text-lg text-muted">· {typologyLabel[net.typology.label]}</span>
            <TierBadge tier={net.priority.tier} />
            {net.status === "needs_review" && <ReviewBadge />}
            {moved && moved.to < moved.from && (
              <span className="inline-flex items-center gap-1 rounded-full bg-good-bg px-2 py-0.5 text-xs font-medium text-good">
                <ArrowUp className="size-3" /> Up from #{moved.from}
              </span>
            )}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span>Rank <span className="font-medium text-fg">#{net.priority.rank}</span> of {total}</span>
            <span className="flex items-center gap-1"><Clock className="size-3" /> First seen {shortDate(m.first_seen)}</span>
            <span>Latest report {shortDate(m.last_seen)}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {packetCase && (
            <a href={api.packetUrl(packetCase.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-bg-raised">
              <Download className="size-4 text-muted" /> Latest packet
            </a>
          )}
          <a href={api.exportUrl(net.id, "csv")} download title="One row per report, for case-management import"
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-bg-raised">
            <FileSpreadsheet className="size-4 text-muted" /> Export CSV
          </a>
          <a href={api.exportUrl(net.id, "json")} download title="Full case file: network, brief, reports and audit trail"
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-bg-raised">
            <FileJson className="size-4 text-muted" /> Export case file
          </a>
        </div>
      </div>
      <dl className="grid grid-cols-2 border-t border-line sm:grid-cols-4">
        <Stat label="Reports" value={String(m.case_count)} />
        <Stat label="Victims" value={String(m.victim_count)} />
        <Stat label="Total loss" value={money(m.total_loss)} />
        <Stat label="Last 7 days" value={`${m.cases_last_7d} new`} />
      </dl>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-line px-5 py-3 [&:not(:first-child)]:border-l max-sm:[&:nth-child(3)]:border-l-0 max-sm:[&:nth-child(n+3)]:border-t">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-base font-semibold tabular">{value}</dd>
    </div>
  );
}

function BriefPanel({
  net, claimIdx, onClaim, onMake, busy, autoPlay, onToggleAuto,
}: {
  net: Network; claimIdx: number | null; autoPlay: boolean; onToggleAuto: () => void;
  onClaim: (i: number, edgeIds: string[]) => void; onMake: () => void; busy: boolean;
}) {
  const b = net.brief;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Analyst brief</h2>
        {b?.checked && (
          <span className="inline-flex items-center gap-1 rounded-full bg-good-bg px-2 py-0.5 text-xs font-medium text-good"><ShieldCheck className="size-3.5" /> Fact-checked</span>
        )}
        {b && !b.checked && (
          <span className="inline-flex items-center gap-1 rounded-full bg-p2-bg px-2 py-0.5 text-xs font-medium text-p2"><UserCheck className="size-3.5" /> Needs a person</span>
        )}
      </div>

      {!b ? (
        <div className="rounded-lg border border-dashed border-line-strong p-4">
          <p className="text-sm text-muted">No brief yet for this network.</p>
          <button onClick={onMake} disabled={busy}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-fg px-3 py-1.5 text-sm font-medium text-bg disabled:opacity-60">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <PenLine className="size-4" />} Write the brief
          </button>
        </div>
      ) : (
        <>
          <p className="text-[14px] leading-relaxed text-fg/90">{plain(b.summary)}</p>

          {b.check_notes.length > 0 && !b.checked && (
            <div className="flex gap-2 rounded-lg bg-p2-bg p-3 text-[13px] text-p2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <div><div className="font-medium">Held for review</div>
                <ul className="mt-0.5">{b.check_notes.map((n) => <li key={n}>{plain(n)}</li>)}</ul></div>
            </div>
          )}

          <Section title="Why it's ranked here">
            <ul className="flex flex-col gap-2">
              {net.priority.reasons.map((r) => (
                <li key={r} className="flex gap-2 text-[13px] leading-snug"><Check className="mt-0.5 size-3.5 shrink-0 text-accent" />{plain(r)}</li>
              ))}
            </ul>
          </Section>

          <Section title="How the reports connect" right={
            <button onClick={onToggleAuto} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted hover:bg-bg-raised hover:text-fg">
              {autoPlay ? <><Pause className="size-3" /> Pause</> : <><Play className="size-3" /> Walk through</>}
            </button>}>
            <ul className="flex flex-col gap-1.5">
              {b.why_linked.map((c, i) => {
                const I = claimIcon(c.claim);
                const on = claimIdx === i;
                return (
                  <li key={i}>
                    <button onClick={() => onClaim(i, c.edge_ids)} aria-pressed={on}
                      className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left text-[13px] leading-snug transition-colors ${
                        on ? "border-accent bg-accent-soft" : "border-line hover:border-line-strong hover:bg-bg-raised"}`}>
                      <span className={`grid size-6 shrink-0 place-items-center rounded-md ${on ? "bg-accent text-on-accent" : "bg-bg-raised text-muted"}`}><I className="size-3.5" /></span>
                      <span className="flex-1">{plain(c.claim)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-faint">Select one to see it on the map.</p>
          </Section>

          {b.gaps.length > 0 && (
            <Section title="Still unknown">
              <ul className="flex flex-col gap-1.5 text-[13px] text-muted">
                {b.gaps.map((g) => <li key={g} className="flex gap-2"><CircleHelp className="mt-0.5 size-3.5 shrink-0 text-faint" />{plain(g)}</li>)}
              </ul>
            </Section>
          )}
          {b.next_steps.length > 0 && (
            <Section title="Suggested next steps">
              <ol className="flex flex-col gap-2 text-[13px]">
                {b.next_steps.map((g, i) => (
                  <li key={g} className="flex gap-2.5"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-bg-raised text-[11px] font-medium text-muted">{i + 1}</span>{plain(g)}</li>
                ))}
              </ol>
              <p className="mt-3 rounded-lg bg-bg-raised px-3 py-2 text-xs text-muted">A person makes the call. Rastro never freezes or blocks accounts.</p>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border-t border-line pt-4">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

const VERDICTS: { about: FeedbackIn["about"]; verdict: FeedbackIn["verdict"]; label: string; icon: Icon }[] = [
  { about: "brief", verdict: "accurate", label: "Accurate", icon: ThumbsUp },
  { about: "brief", verdict: "needs_changes", label: "Needs changes", icon: ThumbsDown },
  { about: "priority", verdict: "agree", label: "Right", icon: Check },
  { about: "priority", verdict: "too_low", label: "Should be higher", icon: ArrowUp },
  { about: "priority", verdict: "too_high", label: "Should be lower", icon: ArrowDown },
];

/** The analyst's verdict on the brief and the ranking. Saved to the audit trail, visible only to this team. */
function FeedbackPanel({ net, team }: { net: Network; team: Team }) {
  const [items, setItems] = useState<AuditEvent[]>([]);
  const [pick, setPick] = useState<Partial<Record<FeedbackIn["about"], FeedbackIn["verdict"]>>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const load = useCallback(() => api.feedback(net.id).then(setItems).catch(() => {}), [net.id]);
  useEffect(() => { load(); }, [load]);
  async function send() {
    setBusy(true);
    try {
      for (const about of ["brief", "priority"] as const) {
        const verdict = pick[about];
        if (verdict) await api.sendFeedback(net.id, { about, verdict, note: note.trim() });
      }
      setPick({}); setNote(""); setSaved(true); load();
    } finally { setBusy(false); }
  }
  const row = (about: FeedbackIn["about"], title: string) => (
    <div>
      <div className="text-[13px] text-muted">{title}</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {VERDICTS.filter((v) => v.about === about).map((v) => {
          const on = pick[about] === v.verdict; const I = v.icon;
          return (
            <button key={v.verdict} type="button" aria-pressed={on} onClick={() => { setSaved(false); setPick((p) => ({ ...p, [about]: on ? undefined : v.verdict })); }}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors ${on ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:border-line-strong hover:text-fg"}`}>
              <I className="size-3.5" /> {v.label}
            </button>
          );
        })}
      </div>
    </div>
  );
  return (
    <div className="mt-5 border-t border-line pt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Your team&apos;s review</h3>
      <div className="mt-3 flex flex-col gap-3">
        {net.brief && row("brief", "Is this brief accurate?")}
        {row("priority", `Is ${net.priority.tier} at #${net.priority.rank} the right priority?`)}
        <textarea value={note} onChange={(e) => { setNote(e.target.value); setSaved(false); }} maxLength={500} rows={2}
          placeholder="Optional note for your team" aria-label="Note"
          className="w-full resize-none rounded-lg border border-line px-3 py-2 text-[13px] outline-none focus:border-accent" />
        <div className="flex items-center gap-3">
          <button type="button" onClick={send} disabled={busy || (!pick.brief && !pick.priority)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-fg px-3 py-1.5 text-sm font-medium text-bg disabled:opacity-40">
            {busy && <Loader2 className="size-4 animate-spin" />} Save review
          </button>
          {saved && <span className="flex items-center gap-1 text-xs text-good"><Check className="size-3.5" /> Saved to the audit trail</span>}
        </div>
      </div>
      {items.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {items.slice(-3).reverse().map((a) => (
            <li key={a.id} className="rounded-lg bg-bg-raised px-3 py-2 text-xs text-muted">
              {a.summary.replace(`${team.name}: `, "")}
              <span className="ml-1 text-faint">· {new Date(a.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-faint">Only {team.name} can see these reviews.</p>
    </div>
  );
}

const statusText: Record<Case["status"], string> = {
  new: "New", processing: "Processing", linked: "Linked", standalone: "Standalone",
  needs_review: "Needs review", flagged_input: "Flagged",
};

function flagText(f: string) {
  if (f === "injection_attempt") return "Tried to trick the system";
  if (f === "repeat_reporter") return "Same reporter as an earlier report";
  if (f.startsWith("name_lookalike")) return "Similar name";
  return f.replace(/_/g, " ");
}

function ReportsTable({ cases }: { cases: Case[] }) {
  if (!cases.length) return <p className="p-5 text-sm text-muted">No reports to show.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="sticky top-0 z-10 bg-bg-raised text-xs text-muted">
          <tr>
            {["Report", "Reported", "Amount", "Contact", "Urgency", "Status", ""].map((h, i) => (
              <th key={i} className={`px-4 py-2.5 font-medium ${i === 2 ? "text-right" : ""}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {cases.slice(0, 80).map((c) => (
            <tr key={c.id} className="hover:bg-bg-raised/60">
              <td className="px-4 py-2.5">
                <span className="flex items-center gap-2">
                  <FileText className="size-4 text-faint" />
                  <span className="font-mono text-xs font-medium">{c.id}</span>
                  {c.source === "live" && <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">New</span>}
                  {c.flags.map((f) => (
                    <span key={f} className="rounded-full bg-p2-bg px-1.5 py-0.5 text-[10px] font-medium text-p2">{flagText(f)}</span>
                  ))}
                </span>
              </td>
              <td className="px-4 py-2.5 text-muted">{shortDate(c.reported_at)}</td>
              <td className="px-4 py-2.5 text-right font-medium tabular">{moneyExact(c.amount)}</td>
              <td className="px-4 py-2.5 text-muted">{channelLabel[c.channel] ?? c.channel}</td>
              <td className="px-4 py-2.5"><TierBadge tier={c.urgency.tier} /></td>
              <td className="px-4 py-2.5 text-muted">{statusText[c.status]}</td>
              <td className="px-4 py-2.5 text-right">
                {c.packet_url ? (
                  <a href={api.packetUrl(c.id)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-accent-soft">
                    <Download className="size-3.5" /> PDF
                  </a>
                ) : <span className="text-xs text-faint">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActivityList({ items, running }: { items: AuditEvent[]; running: boolean }) {
  if (!items.length) return <p className="p-5 text-sm text-muted">Nothing recorded for this network yet.</p>;
  return (
    <ol className="relative p-5">
      {running && (
        <li className="mb-4 flex items-center gap-3 text-sm text-muted"><Loader2 className="size-4 animate-spin text-accent" /> Working on the new report…</li>
      )}
      {items.map((a, i) => {
        const ai = a.actor === "serv" || a.actor === "shadow";
        const I = ai ? Bot : a.actor === "human" ? UserCheck : ShieldCheck;
        return (
          <li key={a.id} className="relative flex gap-3 pb-5 last:pb-0">
            {i < items.length - 1 && <span className="absolute left-[13px] top-7 bottom-0 w-px bg-line" />}
            <span className={`relative grid size-7 shrink-0 place-items-center rounded-full border ${ai ? "border-accent-mid bg-accent-soft text-accent" : "border-line bg-bg text-muted"}`}>
              <I className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-sm font-medium">{stepTitle(a.step)}</span>
                <span className="rounded-full bg-bg-raised px-1.5 py-0.5 text-[10px] font-medium text-muted">{actorText[a.actor]}</span>
                <span className="text-xs text-faint">{a.object_type === "case" ? `Report ${a.object_id}` : a.object_id}</span>
                <span className="ml-auto text-xs text-faint">{new Date(a.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <p className="mt-0.5 text-[13px] text-muted">{stepDetail(a)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const demoSteps: { key: DemoStep[]; label: string }[] = [
  { key: ["reset"], label: "Reset to the starting data" },
  { key: ["chat"], label: "A victim reports a $2,400 scam" },
  { key: ["link"], label: "Rastro links it to an existing network" },
  { key: ["rank", "done"], label: "The network moves up the queue" },
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
      className="fixed bottom-4 right-4 z-40 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-4 rounded-2xl border border-line bg-bg p-5 shadow-2xl"
      role="dialog" aria-label="Live demo">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Live demo</h2>
          <p className="mt-0.5 text-sm text-muted">File a new report and watch the queue change.</p>
        </div>
        <button onClick={onClose} aria-label="Close demo" className="rounded-md p-1 text-muted hover:bg-bg-raised hover:text-fg"><X className="size-4" /></button>
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
        <div ref={box} className="flex max-h-44 flex-col gap-2 overflow-y-auto rounded-xl border border-line bg-bg-raised p-3">
          {msgs.map((m, i) => (
            <p key={i} className={`max-w-[88%] rounded-xl px-3 py-1.5 text-[13px] leading-snug ${
              m.from === "me" ? "self-end bg-accent text-on-accent" : "self-start bg-bg text-fg"}`}>{m.text}</p>
          ))}
        </div>
      )}

      {step === "done" && netMove && (
        <p className="rounded-lg bg-good-bg px-3 py-2 text-sm text-good">N-007 moved from #{netMove.from} to #{netMove.to}.</p>
      )}
      {step === "done" && !netMove && (
        <p className="rounded-lg bg-bg-raised px-3 py-2 text-sm text-muted">The report is filed. Check the queue for any change.</p>
      )}
      {step === "error" && (
        <p role="alert" className="rounded-lg bg-p1-bg px-3 py-2 text-sm text-p1">The demo stopped. Check that the engine is running, then play it again.</p>
      )}

      <button onClick={onPlay} disabled={running}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-on-accent hover:brightness-110 disabled:opacity-60">
        {running ? <><Loader2 className="size-4 animate-spin" /> Running</> : step === "idle" ? <><Play className="size-4" /> Play the demo</> : <><RotateCcw className="size-4" /> Play again</>}
      </button>
      <p className="text-xs text-faint">Playing resets the demo data first. All data is synthetic.</p>
    </motion.div>
  );
}
