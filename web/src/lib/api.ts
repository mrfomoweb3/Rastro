import type {
  AuditEvent, Case, FeedbackIn, IntakeReply, LiveEvent, Network, Stats, Team,
} from "./contract";

const BASE = "/api/rastro";

/** Thrown when the engine answers 401: the analyst needs to sign in. */
export class AuthError extends Error {}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store", credentials: "same-origin" });
  if (res.status === 401) throw new AuthError(path);
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  if (res.status === 401) throw new AuthError(path);
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  stats: () => get<Stats>("/stats"),
  networks: () => get<Network[]>("/networks"),
  /** Open preview of the top of the queue, for the landing page. */
  preview: () => get<Network[]>("/public/networks"),
  me: () => get<Team>("/auth/me"),
  teams: () => get<Team[]>("/auth/teams"),
  login: (team: string, password: string) => post<Team>("/auth/login", { team, password }),
  logout: () => post<{ ok: boolean }>("/auth/logout"),
  feedback: (id: string) => get<AuditEvent[]>(`/networks/${id}/feedback`),
  sendFeedback: (id: string, body: FeedbackIn) => post<AuditEvent>(`/networks/${id}/feedback`, body),
  exportUrl: (id: string, fmt: "csv" | "json") => `${BASE}/networks/${id}/export.${fmt}`,
  network: (id: string) => get<Network>(`/networks/${id}`),
  generateBrief: (id: string) => post<Network>(`/networks/${id}/brief`),
  cases: (limit = 100) => get<Case[]>(`/cases?limit=${limit}`),
  case: (id: string, session?: string) => get<Case>(`/cases/${id}${session ? `?session=${session}` : ""}`),
  audit: (objectId?: string) =>
    get<AuditEvent[]>(`/audit${objectId ? `?object_id=${encodeURIComponent(objectId)}` : ""}`),
  events: (after = 0) => get<LiveEvent[]>(`/events?after=${after}`),
  startIntake: () => post<IntakeReply>("/intake/sessions"),
  sendIntake: (sid: string, text: string) =>
    post<IntakeReply>(`/intake/sessions/${sid}/messages`, { text }),
  packetUrl: (caseId: string, session?: string) =>
    `${BASE}/cases/${caseId}/packet.pdf${session ? `?session=${session}` : ""}`,
};

export async function resetDemo() {
  const res = await fetch("/api/reset", { method: "POST" });
  if (!res.ok) throw new Error("Reset failed");
}
