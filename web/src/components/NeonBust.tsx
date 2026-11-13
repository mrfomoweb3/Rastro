"use client";

import { useEffect, useRef } from "react";

/**
 * A glowing head and shoulders made of light points, with a neon edge and a scan
 * band that keeps travelling down it. Sits behind the hero copy on the white page.
 * Light beams fan out from behind it. Points are kept soft so the headline stays readable.
 */

const VB_W = 200;
const VB_H = 262;

// Front-facing head, neck and shoulders in a 200 x 262 box.
const SILHOUETTE =
  "M100 6 C136 6 152 36 152 74 C152 104 146 126 132 144 C126 152 120 158 116 164 L116 190 " +
  "C116 198 130 204 152 210 C180 217 194 232 197 262 L3 262 C6 232 20 217 48 210 " +
  "C70 204 84 198 84 190 L84 164 C80 158 74 152 68 144 C54 126 48 104 48 74 C48 36 64 6 100 6 Z";

// Face lines, drawn brighter so it reads as a face: jaw, brow, eyes, nose, mouth.
const FACE_LINES: string[] = [
  "M70 144 C78 160 90 170 100 170 C110 170 122 160 130 144",
  "M68 70 C78 64 90 64 94 70", "M106 70 C110 64 122 64 132 70",
  "M74 84 C80 80 88 80 92 84 C88 88 80 88 74 84", "M108 84 C112 80 120 80 126 84 C120 88 112 88 108 84",
  "M100 84 L98 112 C98 116 100 118 104 118",
  "M88 138 C94 142 106 142 112 138",
];

const stops: [number, number, number][] = [
  [34, 211, 238], // cyan
  [42, 86, 240], // blue
  [139, 92, 246], // violet
];
function colour(h: number, a: number) {
  const t = Math.min(1.999, Math.max(0, h) * 2); // 0 top .. 2 bottom
  const i = Math.floor(t);
  const f = t - i;
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

type P = { x: number; y: number; edge: boolean; phase: number; h: number };

function samplePoints(): P[] {
  const m = document.createElement("canvas");
  const S = 4; // mask pixels per unit
  m.width = VB_W * S; m.height = VB_H * S;
  const g = m.getContext("2d", { willReadFrequently: true })!;
  g.scale(S, S);
  g.fill(new Path2D(SILHOUETTE));
  const data = g.getImageData(0, 0, m.width, m.height).data;
  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < VB_W && y < VB_H && data[((Math.floor(y) * S) * m.width + Math.floor(x) * S) * 4 + 3] > 128;
  const pts: P[] = [];
  const step = 3.6;
  let n = 0;
  for (let y = 4; y < VB_H; y += step) {
    for (let x = 2 + ((Math.floor(y / step) % 2) * step) / 2; x < VB_W; x += step) {
      if (!inside(x, y)) continue;
      const edge = !(inside(x - 4, y) && inside(x + 4, y) && inside(x, y - 4) && inside(x, y + 4));
      n++;
      pts.push({ x, y, edge, phase: (n * 2.399) % (Math.PI * 2), h: y / VB_H });
    }
  }
  return pts;
}

export function NeonBust({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pts = samplePoints();
    const faces = FACE_LINES.map((d) => new Path2D(d));
    const outline = new Path2D(SILHOUETTE);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Soft glow sprites (cheap compared with shadowBlur)
    const sprites = [0, 0.25, 0.5, 0.75, 1].map((h) => {
      const s = document.createElement("canvas");
      s.width = s.height = 32;
      const g = s.getContext("2d")!;
      const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, colour(h, 1));
      grad.addColorStop(0.3, colour(h, 0.5));
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
      const c = ctx!;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, w, hgt);
      const scale = Math.min((hgt * 0.92) / VB_H, (w * 0.8) / VB_W);
      const ox = (w - VB_W * scale) / 2;
      const oy = hgt * 0.04;
      const sway = Math.sin(t * 0.0005) * 4; // slow drift, makes the figure feel alive
      const sweep = ((t * 0.00028) % 1.5) - 0.25; // 0..1 travels down the figure

      // Scan lines inside the figure
      c.save();
      c.translate(ox + sway * 0.4, oy);
      c.scale(scale, scale);
      c.clip(outline);
      c.lineWidth = 0.35;
      for (let y = 0; y < VB_H; y += 5) {
        c.strokeStyle = colour(y / VB_H, 0.1);
        c.beginPath(); c.moveTo(0, y); c.lineTo(VB_W, y); c.stroke();
      }
      c.restore();

      // Light points
      for (const p of pts) {
        const px = ox + (p.x + sway * (0.5 + p.h * 0.2)) * scale;
        const py = oy + p.y * scale;
        const band = Math.max(0, 1 - Math.abs(p.h - sweep) * 5);
        const tw = 0.5 + 0.5 * Math.sin(t * 0.002 + p.phase);
        const a = Math.min(1, (p.edge ? 0.55 : 0.16) + tw * 0.14 + band * 0.7);
        const s = (p.edge ? 3.2 : 2.2) * (scale / 2) + band * 4;
        c.globalAlpha = a;
        c.drawImage(sprites[Math.round(p.h * 4)], px - s * 2, py - s * 2, s * 4, s * 4);
      }
      c.globalAlpha = 1;

      // Neon edge and face lines
      c.save();
      c.translate(ox + sway * 0.6, oy);
      c.scale(scale, scale);
      c.lineJoin = c.lineCap = "round";
      const grad = c.createLinearGradient(0, 0, 0, VB_H);
      grad.addColorStop(0, colour(0, 0.9));
      grad.addColorStop(0.5, colour(0.5, 0.75));
      grad.addColorStop(1, colour(1, 0.6));
      for (const [lw, al] of [[3.2, 0.1], [1.6, 0.25], [0.7, 0.9]] as const) {
        c.globalAlpha = al; c.lineWidth = lw; c.strokeStyle = grad;
        c.stroke(outline);
        for (const f of faces) c.stroke(f);
      }
      c.restore();
      c.globalAlpha = 1;
    }

    const loop = (t: number) => {
      if (visible && !document.hidden) draw(t);
      raf = requestAnimationFrame(loop);
    };
    if (reduce) draw(0); else raf = requestAnimationFrame(loop);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
  }, []);

  return (
    <div className={`pointer-events-none absolute inset-x-0 top-0 h-[820px] overflow-hidden ${className}`} aria-hidden="true">
      {/* Soft haze behind the figure */}
      <div className="absolute left-1/2 top-[42%] size-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(42,86,240,.22),rgba(139,92,246,.10)_45%,transparent_70%)] blur-2xl" />
      {/* Light beaming out from behind the head */}
      <div className="beams absolute left-1/2 top-[34%] size-[150vmax] -translate-x-1/2 -translate-y-1/2" />
      <canvas ref={ref} className="absolute inset-0 size-full" />
    </div>
  );
}
