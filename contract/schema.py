"""Rastro shared contract — Pydantic v2 copy (Engine owns this file).

Mirrors BUILD_ENGINE.md section 3.1 word for word. The TypeScript copy lives in
schema.ts (Screen owns it). Any change here must be logged in CHANGELOG.md and
agreed with the Screen owner the same hour.
"""
from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

Tier = Literal["P1", "P2", "P3", "P4"]
ScamType = Literal["investment", "impersonation", "romance", "phishing",
                   "fake_job", "purchase", "unknown"]
Typology = Literal["mule_network", "investment_ring", "impersonation_ring",
                   "romance_ring", "phishing_kit", "mixed", "unknown"]
EntityKind = Literal["account", "phone", "url", "email", "wallet", "name"]
Channel = Literal["whatsapp", "sms", "email", "phone", "social", "website", "other"]
CaseStatus = Literal["new", "processing", "linked", "standalone", "needs_review", "flagged_input"]

STRONG_KINDS = ("account", "phone", "url", "email", "wallet")


class _M(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Entity(_M):
    id: str
    kind: EntityKind
    value: str
    normalized: str
    case_ids: List[str] = Field(default_factory=list)


class Urgency(_M):
    tier: Tier
    hours_since_payment: float
    rule_id: str


class ScamTypeLabel(_M):
    label: ScamType
    confidence: float


class Case(_M):
    id: str
    source: Literal["seed", "live"]
    reported_at: str
    paid_at: str
    amount: float
    channel: Channel
    victim_alias: str
    narrative: str
    scam_messages: List[str] = Field(default_factory=list)
    entities: List[Entity] = Field(default_factory=list)
    urgency: Urgency
    scam_type: ScamTypeLabel
    status: CaseStatus
    flags: List[str] = Field(default_factory=list)
    network_id: Optional[str] = None
    packet_url: Optional[str] = None


class GraphNode(_M):
    id: str
    type: Literal["case", "entity"]
    label: str
    kind: Optional[EntityKind] = None
    tier: Optional[Tier] = None


class GraphEdge(_M):
    id: str
    source: str
    target: str
    strength: Literal["strong", "weak"]
    similarity: float


class Graph(_M):
    nodes: List[GraphNode] = Field(default_factory=list)
    edges: List[GraphEdge] = Field(default_factory=list)


class Metrics(_M):
    case_count: int
    victim_count: int
    total_loss: float
    first_seen: str
    last_seen: str
    cases_last_7d: int


class TypologyLabel(_M):
    label: Typology
    confidence: float


class Priority(_M):
    tier: Tier
    score: float
    rank: int
    rule_ids: List[str] = Field(default_factory=list)
    reasons: List[str] = Field(default_factory=list)


class Claim(_M):
    claim: str
    edge_ids: List[str] = Field(default_factory=list)


class Brief(_M):
    summary: str
    why_linked: List[Claim] = Field(default_factory=list)
    gaps: List[str] = Field(default_factory=list)
    next_steps: List[str] = Field(default_factory=list)
    checked: bool = False
    check_notes: List[str] = Field(default_factory=list)


class Network(_M):
    id: str
    case_ids: List[str]
    graph: Graph
    metrics: Metrics
    typology: TypologyLabel
    priority: Priority
    brief: Optional[Brief] = None
    status: Literal["ok", "needs_review"]
    updated_at: str


class AuditEvent(_M):
    id: str
    object_type: Literal["case", "network"]
    object_id: str
    step: str
    actor: Literal["code", "serv", "shadow", "human"]
    model: Optional[str] = None
    summary: str
    rule_ids: List[str] = Field(default_factory=list)
    cost_usd: float = 0.0
    latency_ms: int = 0
    created_at: str


class Stats(_M):
    cases_total: int
    networks_total: int
    needs_review: int
    total_cost_usd: float
    avg_cost_per_case_usd: float
    avg_seconds_report_to_packet: float
    analyst_hours_saved: float


class IntakeReply(_M):
    session_id: str
    reply: str
    draft: dict  # Partial<Case>
    missing_fields: List[str] = Field(default_factory=list)
    done: bool = False
    case_id: Optional[str] = None
    flagged: bool = False


class LiveEvent(_M):
    id: int
    type: Literal["case_created", "case_linked", "network_reranked", "brief_updated", "needs_review"]
    object_id: str
    message: str
    at: str


class OkReply(_M):
    ok: bool = True


class ErrorReply(_M):
    error: str


class MessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
