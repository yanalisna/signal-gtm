"use client";
import { useState } from "react";
import { Badge, Button, Card, Confidence, Empty, ErrorBox } from "../ui";
import { post, type StepProps } from "../useApp";

export function Icp({ data, refresh, go }: StepProps) {
  const icp = data.state.icp;
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftWhy, setDraftWhy] = useState("");

  async function run(key: string, url: string, body?: unknown, next?: string) {
    setLoading(key);
    setError(null);
    const r = await post(url, body);
    if (!r.ok) setError(r.error!);
    else if (next) go(next);
    await refresh();
    setLoading(null);
  }

  if (!icp)
    return (
      <div className="space-y-4">
        <ErrorBox error={error} />
        <Empty>
          No ICP yet.{" "}
          <Button size="sm" className="ml-2" onClick={() => run("gen", "/api/icp")} loading={loading === "gen"} disabled={!data.state.product}>
            Generate ICP
          </Button>
        </Empty>
      </div>
    );

  return (
    <div className="space-y-5">
      <ErrorBox error={error} />
      <Card
        title="2 · Ideal Customer Profile"
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={() => run("gen", "/api/icp")} loading={loading === "gen"}>
              Regenerate
            </Button>
            <Button size="sm" onClick={() => run("disc", "/api/discover", {}, "discovery")} loading={loading === "disc"}>
              Find target companies →
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-slate-700">{icp.summary}</p>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Industries (NAICS)">
          <ul className="space-y-2">
            {icp.industries.map((i) => (
              <li key={i.naics + i.name} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  <span className="mr-2 font-mono text-xs text-slate-500">{i.naics}</span>
                  {i.name}
                </span>
                <Confidence value={i.confidence} />
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Company size tiers">
          <ul className="space-y-2">
            {icp.sizeTiers.map((t) => (
              <li key={t.tier} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  <b>{t.tier}</b> <span className="text-slate-500">· {t.employees} employees</span>
                </span>
                <Confidence value={t.confidence} />
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Personas · titles · seniority">
          <ul className="space-y-2">
            {icp.personas.map((p) => (
              <li key={p.title} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  <b>{p.title}</b>{" "}
                  <span className="text-slate-500">
                    · {p.seniority} · {p.department}
                  </span>{" "}
                  <Badge tone="indigo">{p.role}</Badge>
                </span>
                <Confidence value={p.confidence} />
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Trigger events">
          <ul className="space-y-2">
            {icp.triggers.map((t) => (
              <li key={t.event} className="flex items-start justify-between gap-3 text-sm">
                <span>
                  <b>{t.event}</b>
                  <div className="text-xs text-slate-500">{t.why}</div>
                </span>
                <Confidence value={t.confidence} />
              </li>
            ))}
          </ul>
          {icp.negativeSignals?.length > 0 && (
            <div className="mt-4 border-t pt-3 text-xs text-slate-600">
              <b>Negative signals (filtered out):</b> {icp.negativeSignals.join(" · ")}
            </div>
          )}
        </Card>
      </div>

      <Card title="Expansion segments — accept, adjust or dismiss">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {icp.expansionSegments.map((s) => (
            <div
              key={s.id}
              className={
                "rounded-lg border p-4 " +
                (s.status === "accepted" ? "border-emerald-400 bg-emerald-50" : s.status === "dismissed" ? "border-slate-200 opacity-50" : "border-slate-200")
              }
            >
              {editing === s.id ? (
                <div className="space-y-2">
                  <input className="w-full rounded border px-2 py-1 text-sm" value={draftName} onChange={(e) => setDraftName(e.target.value)} />
                  <textarea className="h-20 w-full rounded border px-2 py-1 text-xs" value={draftWhy} onChange={(e) => setDraftWhy(e.target.value)} />
                  <Button
                    size="sm"
                    onClick={async () => {
                      await run("seg", "/api/icp/segment", { id: s.id, name: draftName, rationale: draftWhy, status: "accepted" });
                      setEditing(null);
                    }}
                  >
                    Save & accept
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <b className="text-sm">{s.name}</b>
                    <Confidence value={s.confidence} />
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{s.rationale}</p>
                  {s.naics && <div className="mt-1 font-mono text-xs text-slate-400">NAICS {s.naics}</div>}
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="success" onClick={() => run("seg", "/api/icp/segment", { id: s.id, status: "accepted" })}>
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setEditing(s.id);
                        setDraftName(s.name);
                        setDraftWhy(s.rationale);
                      }}
                    >
                      Adjust
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => run("seg", "/api/icp/segment", { id: s.id, status: "dismissed" })}>
                      Dismiss
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">Accepted segments are added to the discovery search.</p>
      </Card>
    </div>
  );
}
