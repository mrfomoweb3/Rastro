"use client";

import { useMemo, useState } from "react";
import type { GraphEdge, GraphNode, Network } from "@/lib/contract";

const W = 760;
const H = 460;

type Pos = { x: number; y: number };

/** Small deterministic force layout. Entities (accounts, phones) pull their reports in. */
function layout(nodes: GraphNode[], edges: GraphEdge[]): Record<string, Pos> {
  const n = nodes.length;
  const idx = new Map(nodes.map((nd, i) => [nd.id, i]));
  const pos: Pos[] = nodes.map((nd, i) => {
    const a = (i / Math.max(n, 1)) * Math.PI * 2;
    const r = nd.type === "entity" ? 70 : 190;
    return { x: W / 2 + Math.cos(a) * r, y: H / 2 + Math.sin(a) * r * 0.7 };
  });
  const k = Math.sqrt((W * H) / Math.max(n, 1)) * 0.62;
  for (let it = 0; it < 220; it++) {
    const t = 1 - it / 220;
    const disp = pos.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y;
        let d = Math.hypot(dx, dy) || 0.01;
        const f = ((k * k) / d) * (nodes[i].type === "entity" && nodes[j].type === "entity" ? 4 : 1);
        dx /= d; dy /= d;
        disp[i].x += dx * f; disp[i].y += dy * f;
        disp[j].x -= dx * f; disp[j].y -= dy * f;
      }
    }
    for (const e of edges) {
      const a = idx.get(e.source), b = idx.get(e.target);
      if (a === undefined || b === undefined) continue;
      const dx = pos[a].x - pos[b].x, dy = pos[a].y - pos[b].y;
      const d = Math.hypot(dx, dy) || 0.01;
      const f = ((d * d) / k) * (e.strength === "strong" ? 1 : 0.15);
      disp[a].x -= (dx / d) * f; disp[a].y -= (dy / d) * f;
      disp[b].x += (dx / d) * f; disp[b].y += (dy / d) * f;
    }
    for (let i = 0; i < n; i++) {
      // gentle pull to centre
      disp[i].x += (W / 2 - pos[i].x) * 0.05;
      disp[i].y += (H / 2 - pos[i].y) * 0.05;
      const d = Math.hypot(disp[i].x, disp[i].y) || 0.01;
      const m = Math.min(d, 14 * t + 1);
      pos[i].x = Math.min(W - 40, Math.max(40, pos[i].x + (disp[i].x / d) * m));
      pos[i].y = Math.min(H - 34, Math.max(34, pos[i].y + (disp[i].y / d) * m));
    }
  }
  // Stretch the result to fill the frame so small networks are not tiny.
  const xs = pos.map((p) => p.x), ys = pos.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const sx = x1 - x0 > 1 ? (W - 160) / (x1 - x0) : 1;
  const sy = y1 - y0 > 1 ? (H - 130) / (y1 - y0) : 1;
  return Object.fromEntries(
    nodes.map((nd, i) => [nd.id, { x: 80 + (pos[i].x - x0) * sx, y: 55 + (pos[i].y - y0) * sy }]),
  );
}

const kindLabel: Record<string, string> = {
  account: "Account", phone: "Phone", url: "Link", email: "Email", wallet: "Wallet", name: "Name",
};

export function NetworkGraph({
  network, highlightEdges, newCaseIds = [],
}: { network: Network; highlightEdges: string[]; newCaseIds?: string[] }) {
  const { nodes, edges } = network.graph;
  const pos = useMemo(() => layout(nodes, edges), [nodes, edges]);
  const [hover, setHover] = useState<string | null>(null);

  const hl = new Set(highlightEdges);
  const hasHl = hl.size > 0;
  const hoverEdges = hover ? new Set(edges.filter((e) => e.source === hover || e.target === hover).map((e) => e.id)) : null;
  const hoverNodes = hover ? new Set(edges.filter((e) => e.source === hover || e.target === hover).flatMap((e) => [e.source, e.target])) : null;
  const newSet = new Set(newCaseIds);
  const hlNodes = new Set(edges.filter((e) => hl.has(e.id)).flatMap((e) => [e.source, e.target]));

  const entities = nodes.filter((nd) => nd.type === "entity");
  const hoverNode = hover ? nodes.find((nd) => nd.id === hover) : null;

  return (
    <div className="relative h-full w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img"
        aria-label={`Link graph for ${network.id}: ${nodes.length} nodes and ${edges.length} links`}>
        <g>
          {edges.map((e) => {
            const a = pos[e.source], b = pos[e.target];
            if (!a || !b) return null;
            const weak = e.strength === "weak";
            const on = hasHl ? hl.has(e.id) : hoverEdges ? hoverEdges.has(e.id) : true;
            return (
              <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={hasHl && hl.has(e.id) ? "var(--accent)" : weak ? "var(--faint)" : "var(--accent)"}
                strokeWidth={hasHl && hl.has(e.id) ? 1.8 : 1}
                strokeDasharray={weak ? "4 4" : undefined}
                opacity={on ? (hasHl || hoverEdges ? 0.95 : 0.3) : 0.06}
                style={{ transition: "opacity .2s" }} />
            );
          })}
        </g>
        <g>
          {nodes.map((nd) => {
            const p = pos[nd.id];
            if (!p) return null;
            const isEntity = nd.type === "entity";
            const dim = hasHl ? !hlNodes.has(nd.id) : hoverNodes ? !hoverNodes.has(nd.id) && nd.id !== hover : false;
            const isNew = newSet.has(nd.id);
            return (
              <g key={nd.id} transform={`translate(${p.x},${p.y})`} opacity={dim ? 0.2 : 1}
                style={{ transition: "opacity .2s", cursor: "pointer" }}
                onMouseEnter={() => setHover(nd.id)} onMouseLeave={() => setHover(null)}>
                {isNew && <circle r="14" fill="none" stroke="var(--p1)" strokeOpacity=".6" className="live-dot" />}
                {isEntity ? (
                  <rect x={-8} y={-8} width={16} height={16} rx={4}
                    fill={nd.kind === "account" ? "var(--accent)" : "var(--p2)"} />
                ) : (
                  <circle r={isNew ? 6 : 4.5}
                    fill={isNew ? "var(--p1)" : "var(--fg)"} fillOpacity={isNew ? 1 : 0.85} />
                )}
                <title>{nd.label}</title>
              </g>
            );
          })}
        </g>
        <g pointerEvents="none">
          {entities.map((nd) => {
            const p = pos[nd.id];
            if (!p) return null;
            return (
              <text key={nd.id} x={p.x} y={p.y + 22} textAnchor="middle" fontSize="11"
                fontFamily="var(--font-geist-mono), monospace" fill="var(--muted)">
                {nd.label.length > 22 ? nd.label.slice(0, 21) + "…" : nd.label}
              </text>
            );
          })}
        </g>
      </svg>
      <div className="pointer-events-none absolute bottom-3 left-4 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-muted">
        <span className="flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-[3px] bg-accent" /> Account</span>
        <span className="flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-[3px] bg-p2" /> Phone or link</span>
        <span className="flex items-center gap-1.5"><i className="inline-block size-2 rounded-full bg-fg/85" /> Report</span>
        <span className="flex items-center gap-1.5"><i className="inline-block w-4 border-t border-dashed border-faint" /> Name look-alike only</span>
      </div>
      {hoverNode && (
        <div className="pointer-events-none absolute right-3 top-3 max-w-[240px] rounded-lg border border-line-strong bg-bg-raised px-3 py-2 text-xs">
          <div className="font-mono text-[10px] uppercase tracking-wider text-faint">
            {hoverNode.type === "entity" ? kindLabel[hoverNode.kind ?? ""] ?? "Entity" : "Report"}
          </div>
          <div className="mt-0.5 break-all font-medium">{hoverNode.label}</div>
        </div>
      )}
    </div>
  );
}
