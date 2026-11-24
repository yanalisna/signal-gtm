// Knowledge graph: built from app state + data/team_history.json.
// Synced to Neo4j when configured; otherwise an in-memory graph gives the same answers.
import fs from "node:fs";
import path from "node:path";
import neo4j, { Driver } from "neo4j-driver";
import { isConfigured } from "./env";
import { load, logActivity } from "./store";
import type { AppState } from "./types";

export type NodeLabel = "Company" | "Person" | "Product" | "Competitor" | "Signal";
export interface GNode {
  id: string;
  label: NodeLabel;
  name: string;
  team?: boolean;
  target?: boolean;
  props?: Record<string, string | number | boolean>;
}
export type RelType =
  | "WORKS_AT"
  | "COMPETES_WITH"
  | "MATCHED_TO"
  | "CONTACTED_VIA"
  | "REPLIED_TO"
  | "PREVIOUSLY_EMPLOYED_AT"
  | "HAS_SIGNAL"
  | "BACKED_BY";
export interface GLink {
  source: string;
  target: string;
  type: RelType;
}

interface TeamHistory {
  team: {
    id: string;
    name: string;
    role?: string;
    previous_employers: { name: string; domain?: string }[];
    contacts?: { name: string; title?: string; current_company: string; current_domain?: string; relationship?: string; previous_company?: string }[];
  }[];
}

export function loadTeamHistory(): TeamHistory {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "team_history.json"), "utf8"));
  } catch {
    return { team: [] };
  }
}

const norm = (s: string) => s.toLowerCase().replace(/^www\./, "").replace(/[^a-z0-9.]/g, "");
const companyKey = (name: string, domain?: string) => "co:" + (domain ? norm(domain) : norm(name));

export function buildGraph(s: AppState = load()) {
  const nodes = new Map<string, GNode>();
  const links: GLink[] = [];
  const add = (n: GNode) => {
    if (!nodes.has(n.id)) nodes.set(n.id, n);
    else Object.assign(nodes.get(n.id)!, { ...n, ...nodes.get(n.id), target: nodes.get(n.id)!.target || n.target });
  };
  const link = (source: string, target: string, type: RelType) => links.push({ source, target, type });

  add({ id: "product", label: "Product", name: "Our product" });

  const idToKey = new Map<string, string>();
  for (const c of s.companies) {
    const key = companyKey(c.name, c.domain);
    idToKey.set(c.id, key);
    add({ id: key, label: "Company", name: c.name, target: true, props: { appId: c.id } });
    if (!c.excluded) link(key, "product", "MATCHED_TO");
  }
  for (const cl of s.claims.filter((c) => c.status === "verified")) {
    const key = idToKey.get(cl.companyId);
    if (!key) continue;
    add({ id: "sig:" + cl.id, label: "Signal", name: cl.signalType, props: { url: cl.url } });
    link(key, "sig:" + cl.id, "HAS_SIGNAL");
  }
  for (const comp of s.competitors) {
    const id = "cmp:" + norm(comp.name);
    add({ id, label: "Competitor", name: comp.name });
    link(id, "product", "COMPETES_WITH");
  }
  const stageRank = ["Matched", "Contacted", "Replied", "Meeting Booked", "Closed Won", "Closed Lost"];
  for (const l of s.leads) {
    const key = idToKey.get(l.companyId);
    if (!key) continue;
    const pid = "p:" + norm(l.email || l.name);
    add({ id: pid, label: "Person", name: `${l.name} (${l.title})` });
    link(pid, key, "WORKS_AT");
    const sent = s.drafts.some((d) => d.leadId === l.id && d.status === "sent");
    if (sent) link(key, pid, "CONTACTED_VIA");
    const stage = s.pipeline[l.companyId];
    if (stage && stageRank.indexOf(stage) >= 2 && stage !== "Closed Lost") link(pid, "product", "REPLIED_TO");
  }
  // Possible warm paths found on the public web (marked "possible path, verify")
  const team = loadTeamHistory().team;
  for (const w of s.warmContacts ?? []) {
    const key = idToKey.get(w.companyId);
    const emp = team.flatMap((m) => m.previous_employers).find((e) => norm(e.name) === norm(w.previousEmployer));
    if (!key || !emp) continue;
    const pid = "web:" + norm(w.name + w.companyId);
    add({ id: pid, label: "Person", name: `${w.name} (${w.title}; possible path, verify)`, props: { url: w.url } });
    link(pid, key, "WORKS_AT");
    const empKey = companyKey(emp.name, emp.domain);
    add({ id: empKey, label: "Company", name: emp.name });
    link(pid, empKey, "PREVIOUSLY_EMPLOYED_AT");
  }
  // Organisation-level possible paths (e.g. target founders ex-Argo AI, which Volkswagen backed)
  for (const w of s.warmLinks ?? []) {
    const key = idToKey.get(w.companyId);
    const emp = team.flatMap((m) => m.previous_employers).find((e) => norm(e.name) === norm(w.employer));
    if (!key || !emp) continue;
    const org = "co:" + norm(w.viaOrg);
    add({ id: org, label: "Company", name: w.viaOrg, props: { url: w.url } });
    const empKey = companyKey(emp.name, emp.domain);
    add({ id: empKey, label: "Company", name: emp.name });
    link(org, empKey, "BACKED_BY");
    const lead = "lead:" + norm(w.companyId + w.viaOrg);
    const cname = s.companies.find((c) => c.id === w.companyId)?.name ?? "";
    add({ id: lead, label: "Person", name: `${cname} leadership (ex-${w.viaOrg}; possible path, verify)`, props: { url: w.url } });
    link(lead, key, "WORKS_AT");
    link(lead, org, "PREVIOUSLY_EMPLOYED_AT");
  }
  for (const m of team) {
    const tid = "team:" + m.id;
    add({ id: tid, label: "Person", name: `${m.name} (our team)`, team: true });
    for (const e of m.previous_employers) {
      const key = companyKey(e.name, e.domain);
      add({ id: key, label: "Company", name: e.name });
      link(tid, key, "PREVIOUSLY_EMPLOYED_AT");
    }
    for (const c of m.contacts ?? []) {
      const pid = "contact:" + norm(c.name + (c.current_domain ?? c.current_company));
      add({ id: pid, label: "Person", name: `${c.name}${c.title ? " (" + c.title + ")" : ""}` });
      const cur = companyKey(c.current_company, c.current_domain);
      add({ id: cur, label: "Company", name: c.current_company });
      link(pid, cur, "WORKS_AT");
      if (c.previous_company) {
        const prev = companyKey(c.previous_company);
        // connect contact to the team member's shared past employer
        const shared = m.previous_employers.find((e) => norm(e.name) === norm(c.previous_company!));
        const prevKey = shared ? companyKey(shared.name, shared.domain) : prev;
        add({ id: prevKey, label: "Company", name: c.previous_company });
        link(pid, prevKey, "PREVIOUSLY_EMPLOYED_AT");
      } else {
        // direct acquaintance (e.g. a former colleague): link via team member's first employer
        const first = m.previous_employers[0];
        if (first) link(pid, companyKey(first.name, first.domain), "PREVIOUSLY_EMPLOYED_AT");
      }
    }
  }
  // drop dangling links
  const valid = links.filter((l) => nodes.has(l.source) && nodes.has(l.target));
  return { nodes: [...nodes.values()], links: valid, idToKey };
}

const PATH_RELS: RelType[] = ["WORKS_AT", "PREVIOUSLY_EMPLOYED_AT", "BACKED_BY"];

/** In-memory shortest warm path (team member → target company), max 4 hops. */
export function warmPathLocal(g: ReturnType<typeof buildGraph>, appCompanyId: string): string[] | null {
  const target = g.idToKey.get(appCompanyId);
  if (!target) return null;
  const adj = new Map<string, string[]>();
  for (const l of g.links.filter((l) => PATH_RELS.includes(l.type))) {
    adj.set(l.source, [...(adj.get(l.source) ?? []), l.target]);
    adj.set(l.target, [...(adj.get(l.target) ?? []), l.source]);
  }
  const starts = g.nodes.filter((n) => n.team).map((n) => n.id);
  const prev = new Map<string, string | null>(starts.map((s) => [s, null]));
  let frontier = starts;
  for (let depth = 0; depth < 4 && frontier.length; depth++) {
    const next: string[] = [];
    for (const n of frontier) {
      for (const m of adj.get(n) ?? []) {
        if (prev.has(m)) continue;
        prev.set(m, n);
        if (m === target) {
          const p: string[] = [];
          let cur: string | null = m;
          while (cur) {
            p.unshift(g.nodes.find((x) => x.id === cur)!.name);
            cur = prev.get(cur) ?? null;
          }
          return p;
        }
        next.push(m);
      }
    }
    frontier = next;
  }
  return null;
}

// ---- Neo4j ----
let driver: Driver | null = null;
function getDriver() {
  if (!isConfigured("neo4j")) return null;
  if (!driver)
    driver = neo4j.driver(process.env.NEO4J_URI!, neo4j.auth.basic(process.env.NEO4J_USERNAME!, process.env.NEO4J_PASSWORD!));
  return driver;
}

export async function syncNeo4j(g = buildGraph()) {
  const d = getDriver();
  if (!d) return { synced: false, reason: "Neo4j not configured (NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD missing) — using in-memory graph." };
  const t0 = Date.now();
  const session = d.session();
  try {
    await session.run("MATCH (n:SignalGTM) DETACH DELETE n");
    const labels: NodeLabel[] = ["Company", "Person", "Product", "Competitor", "Signal"];
    for (const label of labels) {
      const rows = g.nodes.filter((n) => n.label === label).map((n) => ({ id: n.id, name: n.name, team: !!n.team, target: !!n.target }));
      if (rows.length)
        await session.run(
          `UNWIND $rows AS r MERGE (n:SignalGTM:${label} {id: r.id}) SET n.name = r.name, n.team = r.team, n.target = r.target`,
          { rows },
        );
    }
    const types = [...new Set(g.links.map((l) => l.type))];
    for (const t of types) {
      const rows = g.links.filter((l) => l.type === t).map((l) => ({ s: l.source, t: l.target }));
      await session.run(
        `UNWIND $rows AS r MATCH (a:SignalGTM {id: r.s}), (b:SignalGTM {id: r.t}) MERGE (a)-[:${t}]->(b)`,
        { rows },
      );
    }
    logActivity({ step: "graph", message: `Neo4j sync: ${g.nodes.length} nodes, ${g.links.length} relationships`, latencyMs: Date.now() - t0 });
    return { synced: true };
  } finally {
    await session.close();
  }
}

export const WARM_PATH_CYPHER = `MATCH (t:SignalGTM:Person {team: true}), (c:SignalGTM:Company {id: $companyKey})
MATCH p = shortestPath((t)-[:WORKS_AT|PREVIOUSLY_EMPLOYED_AT|BACKED_BY*..4]-(c))
RETURN [n IN nodes(p) | n.name] AS path
ORDER BY length(p) ASC LIMIT 1`;

export async function warmPath(appCompanyId: string, g = buildGraph()): Promise<{ path: string[] | null; via: "neo4j" | "memory" }> {
  const d = getDriver();
  const key = g.idToKey.get(appCompanyId);
  if (d && key) {
    const session = d.session();
    try {
      const r = await session.run(WARM_PATH_CYPHER, { companyKey: key });
      return { path: r.records[0]?.get("path") ?? null, via: "neo4j" };
    } catch (e) {
      logActivity({ step: "graph", message: `Neo4j warm-path query failed: ${(e as Error).message}`, level: "warn" });
    } finally {
      await session.close();
    }
  }
  return { path: warmPathLocal(g, appCompanyId), via: "memory" };
}
