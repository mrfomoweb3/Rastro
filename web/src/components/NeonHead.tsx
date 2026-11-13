"use client";

import { useEffect, useRef } from "react";

/**
 * A glowing figure made of contour rings and light points, slowly turning.
 * Sits behind the hero copy on the white page: light beams fan out behind it,
 * the points are kept soft so the headline stays readable.
 */

type Pt = { x: number; y: number; z: number; h: number };

const RINGS = 38;
const PER_RING = 56;

/** Half-width of the body at height y (-1 = base of shoulders, 1 = top of head). */
function radius(y: number): number {
  const u = (y - 0.32) / 0.68;
  const skull = Math.abs(u) < 1 ? (u < 0 ? 0.44 + 0.04 * u : 0.46) * Math.sqrt(1 - Math.abs(u) ** (u < 0 ? 2.6 : 2)) : 0;
  const neck = y > -0.8 && y < -0.3 ? 0.17 : 0;
  const sh = y <= -0.72 ? 0.2 + 0.62 * Math.min(1, (-0.72 - y) / 0.2) ** 0.55 : 0;
  return Math.max(skull, neck, sh);
}

function buildPoints(): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < RINGS; i++) {
    const y = -1 + (2 * i) / (RINGS - 1);
    const r = radius(y);
    if (r < 0.02) continue;
    const depth = y < -0.72 ? 0.42 : 0.86; // shoulders are flatter front to back
    for (let j = 0; j < PER_RING; j++) {
      const a = (j / PER_RING) * Math.PI * 2;
      const x = Math.sin(a) * r;
      let z = Math.cos(a) * r * depth;
      // nose, brow, lips and chin on the front
      if (Math.cos(a) > 0.6) {
        const f = (Math.cos(a) - 0.6) / 0.4;
        if (y > 0.04 && y < 0.3) z += 0.2 * f * Math.max(0, 1 - Math.abs(y - 0.16) / 0.13);
        if (y > 0.3 && y < 0.4) z += 0.07 * f;
        if (y > -0.12 && y < -0.02) z += 0.05 * f;
        if (y > -0.3 && y < -0.16) z += 0.06 * f;
      }
      pts.push({ x, y, z, h: i / (RINGS - 1) });
    }
  }
  return pts;
}

const stops: [number, number, number][] = [
  [34, 211, 238], // cyan, top
  [42, 86, 240], // blue, middle
  [139, 92, 246], // violet, base
];
function colour(h: number, a: number) {
  const t = (1 - h) * 2; // 0 at top, 2 at base
  const i = Math.min(1, Math.floor(t));
  const f = t - i;
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

export function NeonHead({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pts = buildPoints();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // One soft glow sprite per colour band, drawn instead of shadowBlur (much cheaper).
    const sprites = [0, 0.25, 0.5, 0.75, 1].map((h) => {
      const s = document.createElement("canvas");
      s.width = s.height = 32;
      const g = s.getContext("2d")!;
      const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, colour(h, 1));
      grad.addColorStop(0.25, colour(h, 0.55));
      grad.addColorStop(1, colour(h, 0));
      g.fillStyle = grad;
      g.fillRect(0, 0, 32, 32);
      return s;
    });

    let w = 0, hgt = 0, dpr = 1, raf = 0, visible = true;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = r.width; hgt = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(hgt * dpr);
    };
    resize();
    const ro = new ResizeObserver(() => { resize(); if (reduce) draw(0); });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(canvas);

    function draw(t: number) {
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, w, hgt);
      const narrow = w < 640;
      const size = narrow ? Math.min(hgt * 0.3, w * 0.42) : Math.min(hgt * 0.4, w * 0.36); // pixels per model unit
      const cx = w / 2;
      const cy = narrow ? hgt * 0.36 : hgt * 0.5;
      const yaw = Math.sin(t * 0.0004) * 0.85;
      const cos = Math.cos(yaw), sin = Math.sin(yaw);
      const sweep = ((t * 0.0004) % 1.6) - 0.3; // bright band travelling up the figure

      // Faint contour rings first (the "scan" lines)
      ctx!.lineWidth = 1;
      for (let i = 0; i < RINGS; i++) {
        const base = i * PER_RING;
        if (base >= pts.length) break;
        ctx!.beginPath();
        let started = false;
        for (let j = 0; j <= PER_RING; j++) {
          const p = pts[base + (j % PER_RING)];
          if (!p) break;
          const x = p.x * cos - p.z * sin;
          const z = p.x * sin + p.z * cos;
          const persp = 1 / (1 - z * 0.35);
          const sx = cx + x * size * persp;
          const sy = cy - p.y * size * persp;
          if (!started) { ctx!.moveTo(sx, sy); started = true; } else ctx!.lineTo(sx, sy);
        }
        const p0 = pts[base];
        if (p0) { ctx!.strokeStyle = colour(p0.h, 0.14); ctx!.stroke(); }
      }

      // Glowing points. Points on the near side are brighter; the sweep lights a band.
      for (const p of pts) {
        const x = p.x * cos - p.z * sin;
        const z = p.x * sin + p.z * cos;
        const persp = 1 / (1 - z * 0.35);
        const sx = cx + x * size * persp;
        const sy = cy - p.y * size * persp;
        const front = (z + 0.6) / 1.2; // 0 far .. 1 near
        const band = Math.max(0, 1 - Math.abs(p.y - (sweep * 2 - 1)) * 3.2);
        const a = Math.min(1, 0.08 + front * 0.3 + band * 0.6);
        const s = (1.6 + front * 2 + band * 4) * persp;
        ctx!.globalAlpha = a;
        ctx!.drawImage(sprites[Math.round(p.h * 4)], sx - s * 2, sy - s * 2, s * 4, s * 4);
      }
      ctx!.globalAlpha = 1;
    }

    const loop = (t: number) => {
      if (visible && !document.hidden) draw(t);
      raf = requestAnimationFrame(loop);
    };
    if (reduce) draw(0); else raf = requestAnimationFrame(loop);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
  }, []);

  return (
    <div className={`pointer-events-none absolute inset-x-0 top-0 h-[820px] overflow-hidden opacity-90 sm:opacity-100 ${className}`} aria-hidden="true">
      {/* Soft haze behind the figure */}
      <div className="absolute left-1/2 top-[40%] size-[360px] sm:size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(42,86,240,.20),rgba(139,92,246,.10)_45%,transparent_70%)] blur-2xl" />
      {/* Light beaming out from behind the figure */}
      <div className="beams absolute left-1/2 top-[40%] size-[150vmax] -translate-x-1/2 -translate-y-1/2" />
      <canvas ref={ref} className="absolute inset-0 size-full" />
    </div>
  );
}
