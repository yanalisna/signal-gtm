"use client";
import { useEffect, useState } from "react";
import { Radar, RotateCcw } from "lucide-react";
import { useApp, post } from "@/components/useApp";
import { ActivityFeed } from "@/components/ActivityFeed";
import { Badge, cn } from "@/components/ui";
import type { AppData } from "@/components/useApp";
import { Intake } from "@/components/steps/Intake";
import { Icp } from "@/components/steps/Icp";
import { Discovery } from "@/components/steps/Discovery";
import { Graph } from "@/components/steps/Graph";
import { Leads } from "@/components/steps/Leads";
import { Outreach } from "@/components/steps/Outreach";
import { Pipeline } from "@/components/steps/Pipeline";
import { Band } from "@/components/steps/Band";

const TABS = [
  { id: "intake", label: "1 Intake", C: Intake },
  { id: "icp", label: "2 ICP", C: Icp },
  { id: "discovery", label: "3 Discovery", C: Discovery },
  { id: "graph", label: "4 Graph", C: Graph },
  { id: "leads", label: "5–6 Score & enrich", C: Leads },
  { id: "outreach", label: "7 Outreach", C: Outreach },
  { id: "pipeline", label: "8 Pipeline", C: Pipeline },
  { id: "band", label: "Band agents", C: Band },
];

function done(id: string, d: AppData): boolean {
  const s = d.state;
  switch (id) {
    case "intake": return !!s.product;
    case "icp": return !!s.icp;
    case "discovery": return s.claims.length > 0 && s.claims.every((c) => c.status !== "pending");
    case "graph": return s.usage.graph_queries > 0;
    case "leads": return Object.keys(s.scores).length > 0 && s.leads.length > 0;
    case "outreach": return s.drafts.some((x) => x.status === "sent");
    case "band": return (s.bandLog ?? []).length > 0;
    case "pipeline": return s.events.some((e) => e.actor !== "AI" && e.to !== "Contacted");
    default: return false;
  }
}

const INTEGRATION_LABEL: Record<string, string> = {
  bedrock: "Bedrock",
  tavily: "Tavily",
  hunter: "Hunter",
  neo4j: "Neo4j",
  flexprice: "Flexprice",
  moss: "Moss",
};

export default function Home() {
  const { data, refresh } = useApp();
  const [tab, setTab] = useState("intake");

  // live-refresh the agent feed while long calls run
  useEffect(() => {
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  if (!data) return <div className="p-10 text-slate-500">Loading…</div>;
  const Active = TABS.find((t) => t.id === tab)!.C;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <div className="min-w-0 flex-1">
        <header className="border-b border-slate-200 bg-white">
          <div className="flex flex-wrap items-center gap-4 px-6 py-3">
            <div className="flex items-center gap-2">
              <Radar className="h-6 w-6 text-indigo-600" />
              <div>
                <div className="font-bold tracking-tight">SIGNAL GTM</div>
                <div className="text-[11px] text-slate-500">AI GTM engine · Physical AI</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(data.integrations).map(([k, v]) => (
                <span key={k} title={v.configured ? "Configured" : `Missing: ${v.missing.join(", ")}`}>
                  <Badge tone={v.configured ? "green" : k === "bedrock" && data.llm === "moss" ? "slate" : "amber"}>
                    {v.configured ? "●" : "○"} {INTEGRATION_LABEL[k] ?? k}
                  </Badge>
                </span>
              ))}
              <Badge tone={data.llm === "none" ? "amber" : "green"}>
                LLM: {data.llm === "bedrock" ? "Bedrock" : data.llm === "moss" ? "Moss Inference (fallback)" : "not configured"}
              </Badge>
            </div>
            <span className="ml-auto text-xs text-slate-500">
              Credits{" "}
              <Badge tone={data.credits.ok ? "green" : "red"}>
                {data.credits.balance} · {data.credits.source === "flexprice" ? "Flexprice" : "local ledger"}
              </Badge>
            </span>
            <button
              className="text-xs text-slate-500 hover:text-indigo-600"
              title="Snapshot the current run so it can be replayed without live API calls"
              onClick={async () => {
                const r = await post("/api/demo", { action: "save" });
                alert(r.ok ? "Saved this run as the demo snapshot." : r.error);
                await refresh();
              }}
            >
              Save as demo
            </button>
            <button
              className="text-xs text-slate-500 hover:text-indigo-600"
              title="Replace current state with the saved live run (no API calls)"
              onClick={async () => {
                if (!confirm("Load the saved demo run? This replaces the current run.")) return;
                const r = await post("/api/demo", { action: "load" });
                if (!r.ok) alert(r.error);
                await refresh();
              }}
            >
              Load demo run
            </button>
            <button
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-rose-600"
              onClick={async () => {
                if (!confirm("Clear all companies, leads, drafts and pipeline? (Product description is kept.)")) return;
                await post("/api/reset", { keepProduct: true });
                await refresh();
                setTab("intake");
              }}
            >
              <RotateCcw className="h-3 w-3" /> Reset run
            </button>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-4">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "whitespace-nowrap border-b-2 px-3 py-2 text-sm",
                  tab === t.id ? "border-indigo-600 font-semibold text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800",
                )}
              >
                {done(t.id, data) && <span className="mr-1 text-emerald-600">✓</span>}
                {t.label}
              </button>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-7xl p-6">
          <Active data={data} refresh={refresh} go={setTab} />
        </main>
      </div>
      <ActivityFeed items={data.state.activity} />
    </div>
  );
}
