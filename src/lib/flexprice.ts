// Flexprice usage metering + credit gate.
// When Flexprice keys are missing, a local demo ledger (clearly labelled) is used instead.
import { isConfigured } from "./env";
import { load, logActivity, update, LOCAL_CREDITS_DEFAULT } from "./store";

export type Meter = "leads_enriched" | "outreach_sent" | "graph_queries";

const customerId = () => process.env.FLEXPRICE_CUSTOMER_ID || "signal-gtm-demo";
const base = () => (process.env.FLEXPRICE_BASE_URL || "").replace(/\/$/, "");

async function fp(path: string, init: RequestInit = {}) {
  const res = await fetch(base() + path, {
    ...init,
    headers: { "x-api-key": process.env.FLEXPRICE_API_KEY!, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {}
  if (!res.ok) throw new Error(`Flexprice ${path} → ${res.status}`);
  return json;
}

/** Record a usage event. Never throws: metering must not break the flow. */
export async function meter(event: Meter, properties: Record<string, string> = {}) {
  update((s) => {
    s.usage[event] = (s.usage[event] ?? 0) + 1;
    if (event === "leads_enriched" && !isConfigured("flexprice")) s.localCredits = Math.max(0, s.localCredits - 1);
  });
  if (!isConfigured("flexprice")) return;
  try {
    await fp("/events", {
      method: "POST",
      body: JSON.stringify({
        event_id: `${event}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        event_name: event,
        external_customer_id: customerId(),
        properties,
        source: "signal-gtm",
        timestamp: new Date().toISOString(),
      }),
    });
    logActivity({ step: "billing", message: `Flexprice: metered ${event}` });
  } catch (e) {
    logActivity({ step: "billing", message: `Flexprice metering failed: ${(e as Error).message}`, level: "warn" });
  }
}

interface Wallet {
  id: string;
  credit_balance?: string;
  real_time_credit_balance?: string;
  real_time_balance?: string;
  balance?: string;
}

async function getWallet(): Promise<Wallet | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cust: any = await fp(`/customers/external/${encodeURIComponent(customerId())}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wallets: any = await fp(`/customers/${cust.id}/wallets?include_real_time_balance=true`);
  const list: Wallet[] = Array.isArray(wallets) ? wallets : (wallets?.items ?? wallets?.wallets ?? []);
  return list[0] ?? null;
}

export interface CreditStatus {
  source: "flexprice" | "local-demo";
  balance: number;
  ok: boolean;
  error?: string;
}

export async function creditStatus(): Promise<CreditStatus> {
  if (!isConfigured("flexprice")) {
    const b = load().localCredits;
    return { source: "local-demo", balance: b, ok: b > 0 };
  }
  try {
    const w = await getWallet();
    if (!w) return { source: "flexprice", balance: 0, ok: false, error: "No wallet for customer. Click 'Set up Flexprice customer'." };
    const raw = w.real_time_credit_balance ?? w.credit_balance ?? w.real_time_balance ?? w.balance ?? "0";
    const balance = parseFloat(raw);
    return { source: "flexprice", balance, ok: balance > 0 };
  } catch (e) {
    return { source: "flexprice", balance: 0, ok: false, error: (e as Error).message };
  }
}

/** Create the demo customer + prepaid wallet in Flexprice (user-initiated). */
export async function setupFlexprice() {
  try {
    await fp(`/customers/external/${encodeURIComponent(customerId())}`);
  } catch {
    await fp("/customers", { method: "POST", body: JSON.stringify({ external_id: customerId(), name: "Signal GTM demo" }) });
  }
  const w = await getWallet();
  if (!w) {
    await fp("/wallets", {
      method: "POST",
      body: JSON.stringify({ external_customer_id: customerId(), currency: "USD", wallet_type: "PRE_PAID", initial_credits_to_load: "0" }),
    });
  }
}

/** User clicked "Top up credits". */
export async function topUp(credits = 10) {
  if (!isConfigured("flexprice")) {
    update((s) => {
      s.localCredits += credits;
    });
    return;
  }
  const w = await getWallet();
  if (!w) throw new Error("No Flexprice wallet yet. Set up the customer first.");
  await fp(`/wallets/${w.id}/top-up`, {
    method: "POST",
    body: JSON.stringify({
      credits_to_add: String(credits),
      transaction_reason: "FREE_CREDIT_GRANT",
      idempotency_key: `topup_${Date.now()}`,
      description: "Signal GTM demo top-up",
    }),
  });
}

export { LOCAL_CREDITS_DEFAULT };
