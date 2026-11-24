// Evidence index: every scraped source snippet (URL, company, signal type, text).
// Uses Moss semantic search when the SDK is installed and MOSS_* keys are set;
// otherwise falls back to a local lexical index so the flow still works.
import fs from "node:fs";
import path from "node:path";
import { isConfigured } from "./env";
import { logActivity } from "./store";

export const MOSS_INDEX = "signal-evidence";

export interface EvidenceDoc {
  id: string;
  text: string;
  metadata: { url: string; companyId: string; company: string; signalType: string };
}
export interface EvidenceHit extends EvidenceDoc {
  score: number;
}

const LOCAL_FILE = path.join(process.cwd(), "data", "cache", "evidence.json");

function readLocal(): EvidenceDoc[] {
  try {
    return JSON.parse(fs.readFileSync(LOCAL_FILE, "utf8"));
  } catch {
    return [];
  }
}
function writeLocal(docs: EvidenceDoc[]) {
  fs.mkdirSync(path.dirname(LOCAL_FILE), { recursive: true });
  fs.writeFileSync(LOCAL_FILE, JSON.stringify(docs, null, 2));
}

// ---- Moss SDK (@moss-js/moss) ----
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mossClient: any | null | undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMoss(): Promise<any | null> {
  if (mossClient !== undefined && (mossClient || !isConfigured("moss"))) return mossClient;
  mossClient = null;
  if (!isConfigured("moss")) return null;
  try {
    const { MossClient } = await import("@moss-js/moss");
    mossClient = new MossClient(process.env.MOSS_PROJECT_ID!, process.env.MOSS_PROJECT_KEY!);
  } catch (e) {
    logActivity({ step: "moss", message: `Moss SDK failed to load, using local index (${(e as Error).message.slice(0, 80)})`, level: "warn" });
    mossClient = null;
  }
  return mossClient;
}

export function evidenceBackend(): "moss" | "local" {
  return isConfigured("moss") && mossClient !== null ? "moss" : "local";
}

let mossIndexReady = false;
let mossLoaded = false;

export async function indexEvidence(docs: EvidenceDoc[]) {
  // Always keep a local copy (also used for the UI and as fallback).
  const existing = readLocal();
  const byId = new Map(existing.map((d) => [d.id, d]));
  docs.forEach((d) => byId.set(d.id, d));
  writeLocal([...byId.values()]);

  const moss = await getMoss();
  if (!moss) {
    logActivity({ step: "moss", message: `Indexed ${docs.length} evidence snippets locally (Moss not connected)` });
    return;
  }
  const t0 = Date.now();
  const mossDocs = docs.map((d) => ({ id: d.id, text: d.text, metadata: d.metadata }));
  try {
    if (!mossIndexReady) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existing: any[] = await moss.listIndexes().catch(() => []);
      if (existing.some((i) => i.name === MOSS_INDEX)) await moss.addDocs(MOSS_INDEX, mossDocs, { upsert: true });
      else await moss.createIndex(MOSS_INDEX, mossDocs, { modelId: "moss-minilm" });
      mossIndexReady = true;
    } else {
      await moss.addDocs(MOSS_INDEX, mossDocs, { upsert: true });
    }
    mossLoaded = false; // reload so queries see the new docs
    logActivity({ step: "moss", message: `Moss: upserted ${docs.length} docs into "${MOSS_INDEX}"`, latencyMs: Date.now() - t0 });
  } catch (e) {
    logActivity({ step: "moss", message: `Moss indexing failed: ${(e as Error).message}`, level: "error" });
  }
}

function tokens(s: string) {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
}

function localSearch(query: string, k: number, filter?: (d: EvidenceDoc) => boolean): EvidenceHit[] {
  const q = new Set(tokens(query));
  return readLocal()
    .filter((d) => (filter ? filter(d) : true))
    .map((d) => {
      const t = tokens(d.text);
      const hits = t.filter((x) => q.has(x)).length;
      return { ...d, score: t.length ? hits / Math.sqrt(t.length * Math.max(q.size, 1)) : 0 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

function hitDetail(hits: EvidenceHit[]) {
  return hits.map((h) => `[${h.score.toFixed(2)}] ${h.metadata?.url ?? h.id}`).join("\n");
}

export async function retrieveEvidence(
  query: string,
  opts: { k?: number; companyId?: string; step: string },
): Promise<{ hits: EvidenceHit[]; latencyMs: number; backend: "moss" | "local" }> {
  const k = opts.k ?? 3;
  const filter = opts.companyId ? (d: EvidenceDoc) => d.metadata.companyId === opts.companyId : undefined;
  const moss = await getMoss();
  const t0 = Date.now();
  if (moss) {
    try {
      if (!mossLoaded) {
        await moss.loadIndex(MOSS_INDEX);
        mossLoaded = true;
      }
      const res = await moss.query(MOSS_INDEX, query, { topK: k * 4, alpha: 0.7 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const docs: any[] = res?.docs ?? res?.results ?? res ?? [];
      const hits: EvidenceHit[] = docs
        .map((d) => ({ id: d.id, text: d.text, metadata: d.metadata, score: d.score ?? 0 }))
        .filter((d) => (filter ? filter(d) : true))
        .slice(0, k);
      const latencyMs = res?.timeTakenInMs || Date.now() - t0;
      logActivity({
        step: opts.step,
        message: `Moss retrieval ("${MOSS_INDEX}"): ${hits.length} hits, top score ${hits[0]?.score?.toFixed(3) ?? "-"}`,
        latencyMs,
        detail: hitDetail(hits),
      });
      return { hits, latencyMs, backend: "moss" };
    } catch (e) {
      logActivity({ step: opts.step, message: `Moss query failed, using local: ${(e as Error).message}`, level: "warn" });
    }
  }
  const hits = localSearch(query, k, filter);
  const latencyMs = Date.now() - t0;
  logActivity({
    step: opts.step,
    message: `Local evidence retrieval (Moss not connected): ${hits.length} hits, top score ${hits[0]?.score?.toFixed(3) ?? "-"}`,
    latencyMs,
    detail: hitDetail(hits),
  });
  return { hits, latencyMs, backend: "local" };
}

export function clearLocalEvidence() {
  writeLocal([]);
}
