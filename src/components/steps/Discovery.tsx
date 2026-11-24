"use client";
import { useState } from "react";
import { CheckCircle2, CircleHelp, ExternalLink, Clock } from "lucide-react";
import { Badge, Button, Card, Empty, ErrorBox } from "../ui";
import { post, type StepProps } from "../useApp";

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

export function Discovery({ data, refresh, go }: StepProps) {
  const s = data.state;
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showExcluded, setShowExcluded] = useState(false);

  async function run(key: string, url: string, next?: string) {
    setLoading(key);
    setError(null);
    const r = await post(url);
    if (!r.ok) setError(r.error!);
    else if (next) go(next);
    await refresh();
    setLoading(null);
  }

  const pending = s.claims.filter((c) => c.status === "pending").length;
  const verified = s.claims.filter((c) => c.status === "verified").length;
  const visible = s.companies.filter((c) => showExcluded || !c.excluded);

  return (
    <div className="space-y-5">
      <ErrorBox error={error} />
      <Card
        title="3 · Discovery — target companies with cited signals"
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={() => run("disc", "/api/discover")} loading={loading === "disc"} disabled={!s.icp}>
              {s.companies.length ? "Re-run discovery" : "Run discovery"}
            </Button>
            <Button size="sm" onClick={() => run("ver", "/api/verify")} loading={loading === "ver"} disabled={!pending}>
              Run reviewer ({pending} pending)
            </Button>
            <Button size="sm" variant="secondary" onClick={() => run("score", "/api/score", "leads")} loading={loading === "score"} disabled={!s.companies.length}>
              Score leads →
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap gap-4 text-sm text-slate-600">
          <span>
            <b>{s.companies.filter((c) => !c.excluded).length}</b> companies
          </span>
          <span>
            <b>{s.claims.length}</b> claims · <b className="text-emerald-700">{verified}</b> verified
          </span>
          <span>
            <b>{s.companies.filter((c) => c.excluded).length}</b> removed by negative-signal filter{" "}
            <button className="text-indigo-600 underline" onClick={() => setShowExcluded(!showExcluded)}>
              {showExcluded ? "hide" : "show"}
            </button>
          </span>
          <span>
            Evidence index: <Badge tone={data.evidenceBackend === "moss" ? "violet" : "slate"}>{data.evidenceBackend === "moss" ? "Moss · signal-evidence" : "local (Moss not connected)"}</Badge>
          </span>
        </div>
      </Card>

      {!s.companies.length ? (
        <Empty>{loading === "disc" ? "Searching the web with Tavily and extracting companies… (≈1 min)" : "No companies yet. Run discovery."}</Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {visible.map((c) => {
            const claims = s.claims.filter((x) => x.companyId === c.id);
            return (
              <Card key={c.id} className={c.excluded ? "opacity-60" : ""}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">
                      {c.name} <span className="text-xs font-normal text-slate-500">{c.domain}</span>
                    </div>
                    <div className="text-xs text-slate-600">{c.description}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge>{c.industry}</Badge>
                      {c.sizeEstimate && <Badge>{c.sizeEstimate} emp.</Badge>}
                      <Badge tone="indigo">fit {c.fit.toFixed(2)}</Badge>
                      {c.excluded && <Badge tone="red">Filtered: {c.excluded}</Badge>}
                    </div>
                  </div>
                </div>
                <ul className="mt-3 space-y-2">
                  {claims.map((cl) => (
                    <li key={cl.id} className="rounded-md bg-slate-50 p-2 text-sm">
                      <div className="flex items-start gap-2">
                        {cl.status === "verified" ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        ) : cl.status === "unverified" ? (
                          <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                        ) : (
                          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                        )}
                        <div className="min-w-0">
                          <div>
                            <Badge tone={cl.signalType === "negative" ? "red" : "sky"} className="mr-1">
                              {cl.signalType}
                            </Badge>
                            {cl.text}
                          </div>
                          <a href={cl.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline">
                            {host(cl.url)} <ExternalLink className="h-3 w-3" />
                          </a>
                          {cl.reviewerNote && (
                            <div className="mt-0.5 text-xs text-slate-500">
                              Reviewer ({cl.status}, {cl.reviewerConfidence?.toFixed(2)}): {cl.reviewerNote}
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}

      {s.competitors.length > 0 && (
        <Card title="Competitor map">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-4">Vendor</th>
                  <th className="py-2 pr-4">Positioning</th>
                  <th className="py-2 pr-4">Overlap</th>
                  <th className="py-2 pr-4">How we win</th>
                </tr>
              </thead>
              <tbody>
                {s.competitors.map((c) => (
                  <tr key={c.name} className="border-t align-top">
                    <td className="py-2 pr-4 font-medium">
                      <a href={c.url} target="_blank" rel="noreferrer" className="hover:underline">
                        {c.name}
                      </a>
                      <div className="text-xs font-normal text-slate-400">{host(c.url)}</div>
                    </td>
                    <td className="py-2 pr-4">{c.positioning}</td>
                    <td className="py-2 pr-4">{c.overlap}</td>
                    <td className="py-2 pr-4">{c.differentiator}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
