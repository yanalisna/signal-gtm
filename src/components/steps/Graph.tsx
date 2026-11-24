"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, ErrorBox } from "../ui";
import { post, type StepProps } from "../useApp";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

const COLORS: Record<string, string> = {
  Product: "#4f46e5",
  Company: "#0ea5e9",
  Target: "#f59e0b",
  Person: "#10b981",
  Team: "#e11d48",
  Competitor: "#64748b",
  Signal: "#a855f7",
};

interface GNode {
  id: string;
  label: string;
  name: string;
  team?: boolean;
  target?: boolean;
}

export function Graph({ data, refresh }: StepProps) {
  const [graph, setGraph] = useState<{ nodes: GNode[]; links: { source: string; target: string; type: string }[] } | null>(null);
  const [result, setResult] = useState<{ sync: { synced: boolean; reason?: string }; paths: Record<string, { path: string[] | null; via: string }>; cypher: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);

  useEffect(() => {
    fetch("/api/graph").then((r) => r.json()).then(setGraph);
    const w = () => setWidth(wrap.current?.clientWidth ?? 800);
    w();
    window.addEventListener("resize", w);
    return () => window.removeEventListener("resize", w);
  }, [data]);

  async function sync() {
    setLoading(true);
    setError(null);
    const r = await post<typeof result>("/api/graph");
    if (!r.ok) setError(r.error!);
    else setResult(r.data!);
    await refresh();
    setLoading(false);
  }

  const color = (n: GNode) => (n.team ? COLORS.Team : n.target ? COLORS.Target : COLORS[n.label] ?? "#999");
  const companies = data.state.companies.filter((c) => !c.excluded);

  return (
    <div className="space-y-5">
      <ErrorBox error={error} />
      <Card
        title="4 · Knowledge graph & warm-intro paths"
        actions={
          <Button size="sm" onClick={sync} loading={loading}>
            Sync to Neo4j & find warm paths
          </Button>
        }
      >
        <div className="mb-3 flex flex-wrap gap-3 text-xs">
          {Object.entries({ "Our product": COLORS.Product, "Target company": COLORS.Target, Company: COLORS.Company, Person: COLORS.Person, "Our team": COLORS.Team, Competitor: COLORS.Competitor, Signal: COLORS.Signal }).map(([k, c]) => (
            <span key={k} className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
              {k}
            </span>
          ))}
          <span className="ml-auto">
            {data.integrations.neo4j?.configured ? <Badge tone="green">Neo4j connected</Badge> : <Badge tone="amber">Neo4j keys missing — in-memory graph</Badge>}
          </span>
        </div>
        <div ref={wrap} className="h-[480px] overflow-hidden rounded-lg border bg-slate-50">
          {graph && (
            <ForceGraph2D
              width={width}
              height={480}
              graphData={graph}
              nodeLabel={(n) => `${(n as GNode).label}: ${(n as GNode).name}`}
              nodeColor={(n) => color(n as GNode)}
              nodeVal={(n) => ((n as GNode).label === "Product" ? 8 : (n as GNode).target || (n as GNode).team ? 4 : 2)}
              linkLabel={(l) => (l as { type: string }).type}
              linkDirectionalArrowLength={3}
              linkDirectionalArrowRelPos={1}
              nodeCanvasObjectMode={() => "after"}
              nodeCanvasObject={(node, ctx, scale) => {
                const n = node as GNode & { x: number; y: number };
                if (scale < 1.2 && !(n.target || n.team || n.label === "Product")) return;
                ctx.font = `${10 / scale}px sans-serif`;
                ctx.fillStyle = "#334155";
                ctx.fillText(n.name.slice(0, 28), n.x + 6 / scale, n.y + 3 / scale);
              }}
            />
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Nodes: Company, Person, Product, Competitor, Signal. Relationships: works_at, competes_with, matched_to, contacted_via, replied_to, previously_employed_at, has_signal. Team history comes from{" "}
          <code>data/team_history.json</code>.
        </p>
      </Card>

      {result && (
        <Card title="Warm-intro paths">
          {!result.sync.synced && <div className="mb-3 text-xs text-amber-700">{result.sync.reason}</div>}
          <ul className="space-y-2 text-sm">
            {companies.map((c) => {
              const p = result.paths[c.id];
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-2">
                  <b className="w-48 shrink-0">{c.name}</b>
                  {p?.path ? (
                    <span className="text-emerald-700">{p.path.join("  →  ")}</span>
                  ) : (
                    <span className="text-slate-400">no warm path (cold outreach)</span>
                  )}
                  {p && <Badge>{p.via}</Badge>}
                </li>
              );
            })}
          </ul>
          <details className="mt-4 text-xs">
            <summary className="cursor-pointer text-slate-500">Cypher query used</summary>
            <pre className="mt-2 overflow-x-auto rounded bg-slate-900 p-3 text-slate-100">{result.cypher}</pre>
          </details>
        </Card>
      )}
    </div>
  );
}
