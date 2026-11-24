import { requireIntegration } from "./env";
import { cacheGet, cacheSet, logActivity } from "./store";

export interface HunterEmail {
  value: string;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  seniority: string | null;
  department: string | null;
  confidence: number;
  linkedin?: string | null;
}

export async function domainSearch(domain: string): Promise<{ emails: HunterEmail[]; cached: boolean }> {
  const cached = cacheGet<HunterEmail[]>("hunter-domain", domain);
  if (cached) return { emails: cached, cached: true };
  requireIntegration("hunter");
  const t0 = Date.now();
  const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=10&type=personal&api_key=${process.env.HUNTER_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Hunter domain search failed (${res.status}) for ${domain}`);
  const json = (await res.json()) as { data: { emails: HunterEmail[] } };
  const emails = json.data?.emails ?? [];
  cacheSet("hunter-domain", domain, emails);
  logActivity({ step: "enrichment", message: `Hunter domain search ${domain} → ${emails.length} contacts`, latencyMs: Date.now() - t0 });
  return { emails, cached: false };
}

export async function verifyEmail(email: string): Promise<{ status: string; cached: boolean }> {
  const cached = cacheGet<string>("hunter-verify", email);
  if (cached) return { status: cached, cached: true };
  requireIntegration("hunter");
  const t0 = Date.now();
  const res = await fetch(`https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${process.env.HUNTER_API_KEY}`);
  if (!res.ok) throw new Error(`Hunter verifier failed (${res.status})`);
  const json = (await res.json()) as { data: { status: string; result?: string } };
  const status = json.data?.status ?? json.data?.result ?? "unknown";
  cacheSet("hunter-verify", email, status);
  logActivity({ step: "enrichment", message: `Hunter verify → ${status}`, latencyMs: Date.now() - t0 });
  return { status, cached: false };
}
