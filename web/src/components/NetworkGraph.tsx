"use client";

import { useMemo, useRef, useState, type ComponentType, type PointerEvent as RPointerEvent } from "react";
import { FileText, Globe, Landmark, Mail, Maximize2, Phone, User, Wallet, ZoomIn, ZoomOut, type LucideProps } from "lucide-react";
import type { Case, GraphEdge, GraphNode, Network } from "@/lib/contract";
import { channelLabel, moneyExact } from "@/lib/format";

const W = 800;
const H = 480;
type Pos = { x: number; y: number };

export const kindMeta: Record<string, { label: string; icon: ComponentType<LucideProps>; color: string }> = {
  account: { label: "Bank account", icon: Landmark, color: "var(--accent)" },
  phone: { label: "Phone number", icon: Phone, color: "#7c3aed" },
  url: { label: "Website", icon: Globe, color: "#0e7490" },
  email: { label: "Email address", icon: Mail, color: "#0e7490" },
  wallet: { label: "Crypto wallet", icon: Wallet, color: "#b45309" },
  name: { label: "Name (similar only)", icon: User, color: "var(--faint)" },
};
const metaOf = (nd: GraphNode) => kindMeta[nd.kind ?? ""] ?? kindMeta.name;

export const tierFill: Record<string, string> = { P1: "var(--p1)", P2: "var(--p2)", P3: "#94a3b8", P4: "#cbd5e1" };

/** Shorter, friendlier labels for shared details. */
export function entityLabel(nd: GraphNode) {
  return nd.label.replace(/^acct /, "").replace(/^phone /, "").replace(/^url /, "");
}

/**
 * Hub-and-spoke layout. The busiest shared detail sits in the middle, the others around it.
 * Reports that touch one detail fan out around it; reports that touch two sit between them.
 */
function layout(nodes: GraphNode[], edges: GraphEdge[]): Record<string, Pos> {
  const ents = nodes.filter((n) => n.type === "entity");
  const reps = nodes.filter((n) => n.type === "case");
  const entOf = new Map<string, string[]>();
  const deg = new Map<string, number>();
  const isEnt = new Set(ents.map((e) => e.id));
  const strongReps = new Set(edges.filter((e) => e.strength === "strong").flatMap((e) => [e.source, e.target]));
  for (const e of edges) {
    if (e.strength === "weak" && (strongReps.has(e.source) || strongReps.has(e.target))) continue;
    const [r, en] = isEnt.has(e.source) ? [e.target, e.source] : isEnt.has(e.target) ? [e.source, e.target] : [null, null];
    if (!r || !en) continue;
    entOf.set(r, [...(entOf.get(r) ?? []), en]);
    deg.set(en, (deg.get(en) ?? 0) + 1);
  }
  ents.sort((a, b) => (a.kind === "name" ? 1 : 0) - (b.kind === "name" ? 1 : 0) || (deg.get(b.id) ?? 0) - (deg.get(a.id) ?? 0));

  const pos: Record<string, Pos> = {};
  const C = { x: 0, y: 0 };
  if (ents.length === 1) pos[ents[0].id] = C;
  else if (ents.length > 1) {
    const hub = (deg.get(ents[0].id) ?? 0) >= 2 * (deg.get(ents[1].id) ?? 0);
    const ring = hub ? ents.slice(1) : ents;
    if (hub) pos[ents[0].id] = C;
    const R = hub ? 210 : ring.length === 2 ? 170 : 200;
    ring.forEach((e, i) => {
      const a = -Math.PI / 2 + (i / ring.length) * Math.PI * 2 + (ring.length === 2 ? Math.PI / 2 : 0);
      pos[e.id] = { x: Math.cos(a) * R * 1.3, y: Math.sin(a) * R * 0.8 };
    });
  }

  // Reports around a single detail, in rings, fanned away from the middle.
  const single = new Map<string, string[]>();
  const pairs = new Map<string, string[]>();
  const loose: string[] = [];
  for (const r of reps) {
    const es = [...new Set(entOf.get(r.id) ?? [])];
    if (es.length === 0) loose.push(r.id);
    else if (es.length === 1) single.set(es[0], [...(single.get(es[0]) ?? []), r.id]);
    else { const k = es.sort().join("|"); pairs.set(k, [...(pairs.get(k) ?? []), r.id]); }
  }
  for (const [en, ids] of single) {
    const p = pos[en];
    const centred = Math.hypot(p.x, p.y) < 1;
    const out = Math.atan2(p.y, p.x);
    const span = centred ? Math.PI * 2 : Math.PI * 1.3;
    let placed = 0, ring = 0;
    while (placed < ids.length) {
      const r = 58 + ring * 22;
      const cap = Math.max(4, Math.floor((span * r) / 20));
      const n = Math.min(cap, ids.length - placed);
      for (let j = 0; j < n; j++) {
        const t = centred ? (j + (ring % 2) * 0.5) / n : n === 1 ? 0.5 : j / (n - 1);
        const a = centred ? t * span : out - span / 2 + t * span;
        pos[ids[placed + j]] = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
      }
      placed += n; ring++;
    }
  }
  // Reports that share two or more details sit in a small cluster between them.
  for (const [k, ids] of pairs) {
    const ps = k.split("|").map((id) => pos[id]).filter(Boolean);
    const cx = ps.reduce((s, p) => s + p.x, 0) / ps.length, cy = ps.reduce((s, p) => s + p.y, 0) / ps.length;
    ids.forEach((id, j) => {
      const r = ids.length === 1 ? 0 : 15 * Math.sqrt(j + 0.5), a = j * 2.39996;
      pos[id] = { x: cx + Math.cos(a) * r * 1.2, y: cy + Math.sin(a) * r };
    });
  }
  loose.forEach((id, i) => { const a = (i / Math.max(1, loose.length)) * Math.PI * 2; pos[id] = { x: Math.cos(a) * 280, y: Math.sin(a) * 180 }; });

  // Push apart anything that overlaps. Shared details stay put.
  const all = nodes.map((n) => n.id);
  for (let it = 0; it < 80; it++) {
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const A = pos[all[i]], B = pos[all[j]];
      if (!A || !B) continue;
      const ea = isEnt.has(all[i]), eb = isEnt.has(all[j]);
      const min = ea && eb ? 90 : ea || eb ? 36 : 16;
      let dx = B.x - A.x, dy = B.y - A.y; const d = Math.hypot(dx, dy);
      if (d >= min) continue;
      if (d < 0.01) { dx = 1; dy = 0; }
      const push = (min - d) / 2, ux = dx / (d || 1), uy = dy / (d || 1);
      if (!ea) { A.x -= ux * push * (eb ? 2 : 1); A.y -= uy * push * (eb ? 2 : 1); }
      if (!eb) { B.x += ux * push * (ea ? 2 : 1); B.y += uy * push * (ea ? 2 : 1); }
    }
  }

  // Fit into the frame with one scale, so shapes keep their proportions.
  const xs = Object.values(pos).map((p) => p.x), ys = Object.values(pos).map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const s = Math.min(2.4, (W - 160) / Math.max(1, x1 - x0), (H - 150) / Math.max(1, y1 - y0));
  const ox = W / 2 - ((x0 + x1) / 2) * s, oy = 40 + (H - 150) / 2 - ((y0 + y1) / 2) * s;
  return Object.fromEntries(Object.entries(pos).map(([id, p]) => [id, { x: ox + p.x * s, y: oy + p.y * s }]));
}

export function NetworkGraph({
  network, highlightEdges, newCaseIds = [], cases = [],
}: { network: Network; highlightEdges: string[]; newCaseIds?: string[]; cases?: Case[] }) {
  const { nodes, edges } = network.graph;
  const pos = useMemo(() => layout(nodes, edges), [nodes, edges]);
  const caseById = useMemo(() => new Map(cases.map((c) => [c.id, c])), [cases]);
  const degree = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of edges) { m.set(e.source, (m.get(e.source) ?? 0) + 1); m.set(e.target, (m.get(e.target) ?? 0) + 1); }
    return m;
  }, [edges]);

  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const zoom = (f: number) => setView((v) => {
    const k = Math.min(3, Math.max(0.6, v.k * f));
    return { k, x: W / 2 - ((W / 2 - v.x) * k) / v.k, y: H / 2 - ((H / 2 - v.y) * k) / v.k };
  });
  const onDown = (e: RPointerEvent) => { drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }; };
  const onMove = (e: RPointerEvent) => {
    const d = drag.current; if (!d || !svg.current) return;
    const scale = W / svg.current.getBoundingClientRect().width;
    const dx = (e.clientX - d.x) * scale, dy = (e.clientY - d.y) * scale;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (d.moved) setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
  };

  const [hoverId, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const focus = pinned ?? hoverId;

  const hl = new Set(highlightEdges);
  const touching = focus ? edges.filter((e) => e.source === focus || e.target === focus) : [];
  const activeEdges = hl.size ? hl : focus ? new Set(touching.map((e) => e.id)) : null;
  const activeNodes = activeEdges
    ? new Set([...(focus ? [focus] : []), ...edges.filter((e) => activeEdges.has(e.id)).flatMap((e) => [e.source, e.target])])
    : null;
  const newSet = new Set(newCaseIds);
  const focusNode = focus ? nodes.find((n) => n.id === focus) : null;
  const kindsPresent = [...new Set(nodes.filter((n) => n.type === "entity").map((n) => n.kind ?? "name"))];
  const hasWeak = edges.some((e) => e.strength === "weak");

  return (
    <div className="relative h-full w-full select-none">
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="h-full w-full cursor-grab active:cursor-grabbing touch-none" role="img"
        aria-label={`Link map for ${network.id}: ${nodes.filter((n) => n.type === "case").length} reports joined by shared details`}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => { if (drag.current && !drag.current.moved) setPinned(null); drag.current = null; }}
        onPointerLeave={() => { drag.current = null; }}>
        <defs>
          <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="var(--line-strong)" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#dots)" opacity=".7" />
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          <g>
            {edges.map((e) => {
              const a = pos[e.source], b = pos[e.target];
              if (!a || !b) return null;
              const weak = e.strength === "weak";
              const on = activeEdges?.has(e.id);
              return (
                <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={on ? "var(--accent)" : weak ? "var(--faint)" : "#b8bfcc"}
                  strokeWidth={on ? 2 : 1.1} strokeLinecap="round"
                  strokeDasharray={weak ? "4 4" : on && hl.size ? "6 6" : undefined}
                  className={on && hl.size ? "flow" : undefined}
                  opacity={activeEdges ? (on ? 1 : 0.12) : weak ? 0.7 : 0.75}
                  style={{ transition: "opacity .2s, stroke .2s" }} />
              );
            })}
          </g>
          <g>
            {nodes.map((nd) => {
              const p = pos[nd.id];
              if (!p) return null;
              const dim = activeNodes ? !activeNodes.has(nd.id) : false;
              const events = {
                onPointerEnter: () => setHover(nd.id),
                onPointerLeave: () => setHover(null),
                onPointerUp: (e: RPointerEvent) => { if (drag.current?.moved) return; e.stopPropagation(); drag.current = null; setPinned((x) => (x === nd.id ? null : nd.id)); },
              };
              if (nd.type === "entity") {
                const m = metaOf(nd);
                const Icon = m.icon;
                const label = entityLabel(nd);
                const lw = label.length * 6.4 + 16;
                const isFocus = focus === nd.id;
                return (
                  <g key={nd.id} transform={`translate(${p.x},${p.y})`} opacity={dim ? 0.25 : 1} style={{ transition: "opacity .2s", cursor: "pointer" }} {...events}>
                    <circle r="24" fill={m.color} opacity={isFocus ? 0.18 : 0.08} />
                    <circle r="18" fill="var(--bg)" stroke={m.color} strokeWidth={isFocus ? 2.4 : 1.6}
                      strokeDasharray={nd.kind === "name" ? "3 3" : undefined} />
                    <Icon x={-9} y={-9} width={18} height={18} color={m.color} strokeWidth={2} aria-hidden="true" />
                    <g transform="translate(0,34)">
                      <rect x={-lw / 2} y={-10} width={lw} height={20} rx={10} fill="var(--bg)" stroke="var(--line)" />
                      <text textAnchor="middle" dy="4" fontSize="11" fontWeight={500} fill="var(--fg)" fontFamily="var(--font-geist-mono), monospace">{label}</text>
                    </g>
                    <title>{`${m.label}: ${label}`}</title>
                  </g>
                );
              }
              const c = caseById.get(nd.id);
              const tier = c?.urgency.tier ?? nd.tier ?? "P4";
              const isNew = newSet.has(nd.id) || c?.source === "live";
              return (
                <g key={nd.id} transform={`translate(${p.x},${p.y})`} opacity={dim ? 0.2 : 1} style={{ transition: "opacity .2s", cursor: "pointer" }} {...events}>
                  {isNew && <circle r="13" fill="none" stroke="var(--p1)" strokeWidth="1.5" className="pulse-ring" />}
                  <circle r={10} fill="transparent" />
                  <circle r={isNew ? 7.5 : focus === nd.id ? 7 : 5.5} fill={tierFill[tier]} stroke="var(--bg)" strokeWidth="2" />
                  <title>{`Report ${nd.id}`}</title>
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      {/* Zoom controls */}
      <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-lg border border-line bg-bg shadow-sm">
        <button onClick={() => zoom(1.25)} aria-label="Zoom in" className="grid size-8 place-items-center text-muted hover:bg-bg-raised hover:text-fg"><ZoomIn className="size-4" /></button>
        <button onClick={() => zoom(0.8)} aria-label="Zoom out" className="grid size-8 place-items-center border-y border-line text-muted hover:bg-bg-raised hover:text-fg"><ZoomOut className="size-4" /></button>
        <button onClick={() => setView({ k: 1, x: 0, y: 0 })} aria-label="Fit to view" className="grid size-8 place-items-center text-muted hover:bg-bg-raised hover:text-fg"><Maximize2 className="size-4" /></button>
      </div>

      {/* Details of the hovered or pinned node */}
      {focusNode && (
        <div className="pointer-events-none absolute left-3 top-3 w-[240px] rounded-xl border border-line bg-bg/95 p-3 text-xs shadow-lg backdrop-blur">
          {focusNode.type === "entity" ? (
            <EntityCard nd={focusNode} reports={degree.get(focusNode.id) ?? 0} />
          ) : (
            <ReportCard id={focusNode.id} c={caseById.get(focusNode.id)} />
          )}
        </div>
      )}

      {/* Legend */}
      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-line bg-bg/90 px-3 py-2 text-[11px] text-muted backdrop-blur">
        {kindsPresent.map((k) => {
          const m = kindMeta[k] ?? kindMeta.name; const Icon = m.icon;
          return <span key={k} className="flex items-center gap-1.5"><Icon className="size-3.5" style={{ color: m.color }} />{m.label}</span>;
        })}
        <span className="flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-full bg-p1" />Urgent report</span>
        <span className="flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-full bg-[#94a3b8]" />Report</span>
        {hasWeak && <span className="flex items-center gap-1.5"><i className="inline-block w-4 border-t border-dashed border-faint" />Similar name only</span>}
      </div>
    </div>
  );
}

function EntityCard({ nd, reports }: { nd: GraphNode; reports: number }) {
  const m = metaOf(nd); const Icon = m.icon;
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-lg" style={{ background: `color-mix(in srgb, ${m.color} 12%, transparent)`, color: m.color }}><Icon className="size-4" /></span>
        <div>
          <div className="text-[11px] text-muted">{m.label}</div>
          <div className="font-mono text-[13px] font-medium text-fg">{entityLabel(nd)}</div>
        </div>
      </div>
      <p className="mt-2 text-muted">Shared by <span className="font-medium text-fg">{reports} report{reports === 1 ? "" : "s"}</span>{nd.kind === "name" ? ". Names never join reports on their own." : "."}</p>
    </>
  );
}

function ReportCard({ id, c }: { id: string; c?: Case }) {
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-lg bg-bg-raised text-muted"><FileText className="size-4" /></span>
        <div>
          <div className="text-[11px] text-muted">Report{c?.source === "live" ? " · new" : ""}</div>
          <div className="font-mono text-[13px] font-medium text-fg">{id}</div>
        </div>
      </div>
      {c && (
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
          <dt className="text-muted">Amount</dt><dd className="text-right font-medium tabular text-fg">{moneyExact(c.amount)}</dd>
          <dt className="text-muted">Contact</dt><dd className="text-right text-fg">{channelLabel[c.channel] ?? c.channel}</dd>
          <dt className="text-muted">Urgency</dt><dd className="text-right font-medium text-fg">{c.urgency.tier}</dd>
          <dt className="text-muted">Reported</dt><dd className="text-right text-fg">{new Date(c.reported_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</dd>
        </dl>
      )}
    </>
  );
}
