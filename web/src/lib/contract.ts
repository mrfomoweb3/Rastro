// Rastro shared contract — TypeScript copy. Screen owns this file.
// Engine seeded it from BUILD_ENGINE.md section 3.1 (identical). Change both
// copies + CHANGELOG.md together.

export type Tier = "P1" | "P2" | "P3" | "P4";            // P1 = most urgent
export type ScamType = "investment" | "impersonation" | "romance" | "phishing"
  | "fake_job" | "purchase" | "unknown";
export type Typology = "mule_network" | "investment_ring" | "impersonation_ring"
  | "romance_ring" | "phishing_kit" | "mixed" | "unknown";

export interface Case {
  id: string;
  source: "seed" | "live";
  reported_at: string;
  paid_at: string;
  amount: number;
  channel: "whatsapp" | "sms" | "email" | "phone" | "social" | "website" | "other";
  victim_alias: string;
  narrative: string;
  scam_messages: string[];
  entities: Entity[];
  urgency: { tier: Tier; hours_since_payment: number; rule_id: string };
  scam_type: { label: ScamType; confidence: number };
  status: "new" | "processing" | "linked" | "standalone" | "needs_review" | "flagged_input";
  flags: string[];
  network_id: string | null;
  packet_url: string | null;
}

export interface Entity {
  id: string;
  kind: "account" | "phone" | "url" | "email" | "wallet" | "name";
  value: string;
  normalized: string;
  case_ids: string[];
}

export interface GraphNode { id: string; type: "case" | "entity"; label: string; kind?: Entity["kind"]; tier?: Tier }
export interface GraphEdge {
  id: string; source: string; target: string;
  strength: "strong" | "weak"; similarity: number
}

export interface Network {
  id: string;
  case_ids: string[];
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  metrics: {
    case_count: number; victim_count: number; total_loss: number;
    first_seen: string; last_seen: string; cases_last_7d: number
  };
  typology: { label: Typology; confidence: number };
  priority: { tier: Tier; score: number; rank: number; rule_ids: string[]; reasons: string[] };
  brief: Brief | null;
  status: "ok" | "needs_review";
  updated_at: string;
}

export interface Brief {
  summary: string;
  why_linked: { claim: string; edge_ids: string[] }[];
  gaps: string[];
  next_steps: string[];
  checked: boolean;
  check_notes: string[];
}

export interface AuditEvent {
  id: string; object_type: "case" | "network"; object_id: string;
  step: string;
  actor: "code" | "serv" | "shadow" | "human";
  model: string | null;
  summary: string;
  rule_ids: string[];
  cost_usd: number; latency_ms: number; created_at: string;
}

export interface Stats {
  cases_total: number; networks_total: number; needs_review: number;
  total_cost_usd: number; avg_cost_per_case_usd: number;
  avg_seconds_report_to_packet: number; analyst_hours_saved: number;
}

export interface IntakeReply {
  session_id: string; reply: string;
  draft: Partial<Case>;
  missing_fields: string[];
  done: boolean; case_id: string | null;
  flagged: boolean;
}

export interface LiveEvent {
  id: number; type: "case_created" | "case_linked" | "network_reranked"
  | "brief_updated" | "needs_review"; object_id: string;
  message: string; at: string
}
