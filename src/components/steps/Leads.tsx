"use client";
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Badge, Button, Card, Empty, ErrorBox, TIER_TONE } from "../ui";
import { post, type StepProps } from "../useApp";

export function Leads({ data, refresh, go }: StepProps) {
  const s = data.state;
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function run(key: string, url: string, body?: unknown, next?: string) {
    setLoading(key);
    setError(null);
    setInfo(null);
    const r = await post<{ skipped?: string[] }>(url, body);
    if (!r.ok) setError(r.error!);
    else {
      if (r.data?.skipped?.length) setInfo("Skipped: " + r.data.skipped.join(" · "));
      if (next) go(next);
    }
    await refresh();
    setLoading(null);
  }

  const rows = s.companies
    .filter((c) => !c.excluded && s.scores[c.id])
    .sort((a, b) => s.scores[b.id].total - s.scores[a.id].total);
  const blocked = !data.credits.ok;

  return (
    <div className="space-y-5">
      <ErrorBox error={error} />
      {info && <div className="rounded-md bg-slate-100 px-4 py-2 text-xs text-slate-600">{info}</div>}
      <Card
        title="5–6 · Scoring & enrichment"
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={() => run("score", "/api/score")} loading={loading === "score"} disabled={!s.companies.length}>
              {rows.length ? "Re-score" : "Score leads"}
            </Button>
            <Button size="sm" onClick={() => run("enrich", "/api/enrich").then(() => post("/api/score")).then(refresh)} loading={loading === "enrich"} disabled={!rows.length}>
              Enrich top 5 with Hunter
            </Button>
            <Button size="sm" variant="secondary" onClick={() => run("draft", "/api/outreach/draft", {}, "outreach")} loading={loading === "draft"} disabled={!rows.length}>
              Draft outreach →
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span>
            Score = <b>Fit 40</b> + <b>Signal 40</b> + <b>Relationship 20</b> → Tier A ≥ 70, B ≥ 50, else C
          </span>
          <span className="ml-auto flex items-center gap-2">
            Credits:{" "}
            <Badge tone={blocked ? "red" : "green"}>
              {data.credits.balance} ({data.credits.source === "flexprice" ? "Flexprice" : "local demo ledger"})
            </Badge>
            {blocked && (
              <Button size="sm" variant="danger" onClick={() => run("topup", "/api/credits", { action: "topup", credits: 10 })} loading={loading === "topup"}>
                Top up credits
              </Button>
            )}
          </span>
        </div>
        {data.credits.error && <div className="mt-2 text-xs text-amber-700">{data.credits.error}</div>}
      </Card>

      {!rows.length ? (
        <Empty>No scores yet. Run Discovery and the Reviewer (tab 3), then click “Score leads”.</Empty>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Company</th>
                  <th className="py-2 pr-3">Tier</th>
                  <th className="py-2 pr-3">Score</th>
                  <th className="py-2 pr-3">Fit / Signal / Rel.</th>
                  <th className="py-2 pr-3">Why now</th>
                  <th className="py-2 pr-3">Contact</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const sc = s.scores[c.id];
                  const lead = s.leads.find((l) => l.companyId === c.id);
                  return (
                    <tr key={c.id} className="border-t align-top">
                      <td className="py-3 pr-3">
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-slate-500">{c.domain}</div>
                      </td>
                      <td className="py-3 pr-3">
                        <Badge tone={TIER_TONE[sc.tier]}>Tier {sc.tier}</Badge>
                      </td>
                      <td className="py-3 pr-3 text-lg font-semibold">{sc.total}</td>
                      <td className="py-3 pr-3 font-mono text-xs">
                        {sc.fit} / {sc.signal} / {sc.relationship}
                        {sc.warmPath && <div className="mt-1 font-sans text-emerald-700">warm: {sc.warmPath.join(" → ")}</div>}
                      </td>
                      <td className="max-w-md py-3 pr-3">
                        <div>{sc.whyNow}</div>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {sc.citations.map((u, i) => (
                            <a key={u} href={u} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-xs text-indigo-600 hover:underline">
                              [{i + 1}] <ExternalLink className="h-3 w-3" />
                            </a>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-xs">
                        {lead ? (
                          <>
                            <div className="font-medium">{lead.name}</div>
                            <div className="text-slate-500">{lead.title}</div>
                            <div className="font-mono">{lead.email}</div>
                            <Badge tone={lead.verification === "valid" ? "green" : "amber"}>{lead.verification}</Badge>
                          </>
                        ) : (
                          <span className="text-slate-400">not enriched</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
