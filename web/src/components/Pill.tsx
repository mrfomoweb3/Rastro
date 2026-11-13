import Link from "next/link";
import type { ComponentProps } from "react";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-[transform,background-color,border-color] duration-150 hover:-translate-y-px active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none";

const variants = {
  solid: "bg-fg text-bg hover:bg-fg/90",
  accent: "bg-accent text-on-accent hover:brightness-110",
  outline: "border border-line-strong text-fg hover:border-fg/60",
  ghost: "text-muted hover:text-fg",
} as const;

type Variant = keyof typeof variants;

export function PillLink({ variant = "solid", className = "", ...props }: { variant?: Variant } & ComponentProps<typeof Link>) {
  return <Link className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function PillButton({ variant = "solid", className = "", ...props }: { variant?: Variant } & ComponentProps<"button">) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}
