export type Conf = number; // 0.00 - 1.00

export interface Criteria {
  geography: string;
  companySize: string;
  budget: string;
  excluded: string;
  notes: string;
}

export interface ICP {
  summary: string;
  industries: { naics: string; name: string; confidence: Conf }[];
  sizeTiers: { tier: string; employees: string; confidence: Conf }[];
  personas: { title: string; seniority: string; department: string; role: string; confidence: Conf }[];
  triggers: { event: string; why: string; confidence: Conf }[];
  negativeSignals: string[];
  expansionSegments: {
    id: string;
    name: string;
    rationale: string;
    naics?: string;
    confidence: Conf;
    status: "proposed" | "accepted" | "dismissed";
  }[];
}

export type SignalType = "funding" | "hiring" | "expansion" | "product_launch" | "partnership" | "negative" | "other";

export interface Claim {
  id: string;
  companyId: string;
  text: string;
  signalType: SignalType;
  url: string;
  snippet: string;
  status: "pending" | "verified" | "unverified";
  reviewerNote?: string;
  reviewerConfidence?: number;
}

export interface Company {
  id: string;
  name: string;
  domain: string;
  description: string;
  industry: string;
  sizeEstimate?: string;
  fit: number; // 0-1 LLM fit vs ICP
  fitReason: string;
  excluded?: string; // negative-signal filter reason
}

export interface Competitor {
  name: string;
  url: string;
  positioning: string;
  overlap: string;
  differentiator: string;
}

export interface Lead {
  id: string;
  companyId: string;
  name: string;
  title: string;
  email: string;
  confidence?: number;
  verification?: string; // hunter verifier status
  linkedin?: string;
}

/** A person found on the public web who works at a target company and previously worked at a team member's past employer. */
export interface WarmContact {
  id: string;
  companyId: string;
  name: string;
  title: string;
  previousEmployer: string; // must match a team member's previous employer
  url: string; // public source
  quote: string;
}

/** Organisation-level possible path: target's leaders previously worked at `viaOrg`, which is linked to a team employer. */
export interface WarmLink {
  id: string;
  companyId: string;
  viaOrg: string;
  relation: string; // how viaOrg relates to the employer, e.g. "backed by"
  employer: string; // must match a team member's previous employer
  url: string;
  quote: string;
}

export interface Score {
  companyId: string;
  fit: number;
  signal: number;
  relationship: number;
  total: number;
  tier: "A" | "B" | "C";
  whyNow: string;
  citations: string[];
  warmPath?: string[];
  warmPathSource?: string; // public URL backing a "possible path, verify" hop
}

export interface Draft {
  id: string;
  companyId: string;
  leadId?: string;
  variant: "A" | "B";
  subject: string;
  body: string;
  followUpSubject: string;
  followUpBody: string;
  citations: string[];
  status: "draft" | "approved" | "rejected" | "sent";
  createdAt: string;
  updatedAt: string;
}

export const STAGES = ["Matched", "Contacted", "Replied", "Meeting Booked", "Closed Won", "Closed Lost"] as const;
export type Stage = (typeof STAGES)[number];

export interface PipelineEvent {
  ts: string;
  companyId: string;
  from: Stage | null;
  to: Stage;
  actor: "AI" | "Rep" | "Simulated";
  note?: string;
}

export interface Activity {
  ts: string;
  step: string;
  message: string;
  latencyMs?: number;
  detail?: string;
  level?: "info" | "warn" | "error";
}

export interface AuditEntry {
  ts: string;
  actor: "AI" | "Rep" | "System";
  action: string;
  target: string;
  detail?: string;
}

export interface BandLogEntry {
  ts: string;
  from: string; // agent role name or human name
  kind: "message" | "thought" | "task" | "approval" | "error";
  content: string;
  to?: string[];
}

export interface AppState {
  product?: { description: string; criteria: Criteria };
  icp?: ICP;
  companies: Company[];
  claims: Claim[];
  competitors: Competitor[];
  leads: Lead[];
  warmContacts?: WarmContact[];
  warmLinks?: WarmLink[];
  scores: Record<string, Score>;
  drafts: Draft[];
  pipeline: Record<string, Stage>;
  events: PipelineEvent[];
  activity: Activity[];
  audit: AuditEntry[];
  usage: { leads_enriched: number; outreach_sent: number; graph_queries: number };
  localCredits: number;
  /** leads_enriched events metered to Flexprice; subtracted from the wallet's granted credits (Flexprice has no direct debit API). */
  flexpriceConsumed?: number;
  /** Mirror of what the Band agents posted (and human approvals received) for the in-app stream. */
  bandLog?: BandLogEntry[];
  /** Band message ids already processed as approvals. */
  bandSeen?: string[];
}
