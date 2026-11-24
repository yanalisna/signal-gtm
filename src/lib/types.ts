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

export interface AppState {
  product?: { description: string; criteria: Criteria };
  icp?: ICP;
  companies: Company[];
  claims: Claim[];
  competitors: Competitor[];
  leads: Lead[];
  scores: Record<string, Score>;
  drafts: Draft[];
  pipeline: Record<string, Stage>;
  events: PipelineEvent[];
  activity: Activity[];
  audit: AuditEntry[];
  usage: { leads_enriched: number; outreach_sent: number; graph_queries: number };
  localCredits: number;
}
