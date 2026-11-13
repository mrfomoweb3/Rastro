import type { Tier } from "./contract";

export const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export const moneyExact = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

export const tierClass: Record<Tier, string> = {
  P1: "bg-p1-bg text-p1",
  P2: "bg-p2-bg text-p2",
  P3: "bg-sunk text-muted",
  P4: "bg-sunk text-faint",
};

export const typologyLabel: Record<string, string> = {
  mule_network: "Mule network",
  investment_ring: "Investment ring",
  impersonation_ring: "Impersonation ring",
  romance_ring: "Romance ring",
  phishing_kit: "Phishing kit",
  mixed: "Mixed",
  unknown: "Unknown",
};

export function ago(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
