import { route } from "@/lib/api";
import { buildGraph, syncNeo4j, warmPath, WARM_PATH_CYPHER } from "@/lib/graph";
import { meter } from "@/lib/flexprice";
import { load } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = buildGraph();
  return Response.json({ nodes: g.nodes, links: g.links });
}

// Sync to Neo4j and compute warm-intro paths for every target company.
export const POST = route("graph", async () => {
  const g = buildGraph();
  const sync = await syncNeo4j(g);
  const s = load();
  const paths: Record<string, { path: string[] | null; via: string }> = {};
  for (const c of s.companies.filter((c) => !c.excluded)) {
    paths[c.id] = await warmPath(c.id, g);
  }
  await meter("graph_queries", { count: String(Object.keys(paths).length) });
  return { sync, paths, cypher: WARM_PATH_CYPHER, nodes: g.nodes.length, links: g.links.length };
});
