import fs from "node:fs";
import path from "node:path";
import type { Activity, AppState, AuditEntry } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");

export const LOCAL_CREDITS_DEFAULT = 10;

function empty(): AppState {
  return {
    companies: [],
    claims: [],
    competitors: [],
    leads: [],
    scores: {},
    drafts: [],
    pipeline: {},
    events: [],
    activity: [],
    audit: [],
    usage: { leads_enriched: 0, outreach_sent: 0, graph_queries: 0 },
    localCredits: LOCAL_CREDITS_DEFAULT,
  };
}

export function load(): AppState {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    return { ...empty(), ...JSON.parse(raw) };
  } catch {
    return empty();
  }
}

export function save(state: AppState) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = STATE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE);
}

/** Read-modify-write helper. */
export function update<T>(fn: (s: AppState) => T): T {
  const s = load();
  const r = fn(s);
  save(s);
  return r;
}

export function reset(keepProduct = false) {
  const s = load();
  const fresh = empty();
  if (keepProduct) {
    fresh.product = s.product;
  }
  fresh.localCredits = s.localCredits;
  save(fresh);
}

export function logActivity(a: Omit<Activity, "ts">) {
  update((s) => {
    s.activity.push({ ts: new Date().toISOString(), ...a });
    if (s.activity.length > 400) s.activity = s.activity.slice(-400);
  });
}

export function audit(a: Omit<AuditEntry, "ts">) {
  update((s) => {
    s.audit.push({ ts: new Date().toISOString(), ...a });
  });
}

export function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

// Simple disk cache (used for Hunter to protect the tiny free tier)
const CACHE_DIR = path.join(DATA_DIR, "cache");
export function cacheGet<T>(ns: string, key: string): T | undefined {
  try {
    const f = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, `${ns}.json`), "utf8"));
    return f[key];
  } catch {
    return undefined;
  }
}
export function cacheSet(ns: string, key: string, value: unknown) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, `${ns}.json`);
  let f: Record<string, unknown> = {};
  try {
    f = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {}
  f[key] = value;
  fs.writeFileSync(file, JSON.stringify(f, null, 2));
}
