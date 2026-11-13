import type {
  AuditEvent, Case, IntakeReply, LiveEvent, Network, Stats,
} from "./contract";

const BASE = "/api/rastro";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  stats: () => get<Stats>("/stats"),
  networks: () => get<Network[]>("/networks"),
  network: (id: string) => get<Network>(`/networks/${id}`),
  generateBrief: (id: string) => post<Network>(`/networks/${id}/brief`),
  cases: (limit = 100) => get<Case[]>(`/cases?limit=${limit}`),
  case: (id: string) => get<Case>(`/cases/${id}`),
  audit: (objectId?: string) =>
    get<AuditEvent[]>(`/audit${objectId ? `?object_id=${encodeURIComponent(objectId)}` : ""}`),
  events: (after = 0) => get<LiveEvent[]>(`/events?after=${after}`),
  startIntake: () => post<IntakeReply>("/intake/sessions"),
  sendIntake: (sid: string, text: string) =>
    post<IntakeReply>(`/intake/sessions/${sid}/messages`, { text }),
  packetUrl: (caseId: string) => `${BASE}/cases/${caseId}/packet.pdf`,
};

export async function resetDemo() {
  const res = await fetch("/api/reset", { method: "POST" });
  if (!res.ok) throw new Error("Reset failed");
}
