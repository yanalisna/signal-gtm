"use client";
import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { Badge, Button, Card, Empty, ErrorBox, TIER_TONE } from "../ui";
import { post, type StepProps } from "../useApp";
import { STAGES, type Stage } from "@/lib/types";

const RANK: Record<Stage, number> = { Matched: 0, Contacted: 1, Replied: 2, "Meeting Booked": 3, "Closed Won": 4, "Closed Lost": -1 };

function pct(n: number, d: number) {
  return d ? `${Math.round((100 * n) / d)}%` : "–";
}

export function Pipeline({ data, refresh }: StepProps) {
  const s = data.state;
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const ids = Object.keys(s.pipeline);

  // Has a deal ever reached a stage? (use event history so Closed Lost deals still count as Contacted/Replied)
  const reached = (companyId: string, stage: Stage) =>
    s.events.some((e) => e.companyId === companyId && (e.to === stage || RANK[e.to] >= RANK[stage]));

  async function move(companyId: string, to: Stage) {
    const r = await post("/api/pipeline", { action: "move", companyId, to });
    if (!r.ok) setError(r.error!);
    await refresh();
  }

  const funnel = (["Contacted", "Replied", "Meeting Booked", "Closed Won"] as Stage[]).map((st) => ({ st, n: ids.filter((id) => reached(id, st)).length }));
  const tiers = (["A", "B", "C"] as const).map((t) => {
    const g = ids.filter((id) => s.scores[id]?.tier === t);
    const contacted = g.filter((id) => reached(id, "Contacted")).length;
    return { t, total: g.length, contacted, replied: g.filter((id) => reached(id, "Replied")).length, meetings: g.filter((id) => reached(id, "Meeting Booked")).length };
  });
  const ab = (["A", "B"] as const).map((v) => {
    const g = s.drafts.filter((d) => d.status === "sent" && d.variant === v).map((d) => d.companyId);
    return { v, sent: g.length, replied: g.filter((id) => reached(id, "Replied")).length, meetings: g.filter((id) => reached(id, "Meeting Booked")).length };
  });

  return (
    <div className="space-y-5">
      <ErrorBox error={error} />
      <Card
        title="8 · Pipeline"
        actions={
          <Button
            size="sm"
            variant="secondary"
            loading={loading}
            onClick={async () => {
              setLoading(true);
              await post("/api/pipeline", { action: "simulate" });
              await refresh();
              setLoading(false);
            }}
          >
            <FlaskConical className="h-4 w-4" /> Simulate replies (SIMULATED DATA)
          </Button>
        }
      >
        {!ids.length ? (
          <Empty>No deals yet — discovery adds matched companies here.</Empty>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {STAGES.map((st) => (
              <div
                key={st}
                className="min-h-40 rounded-lg bg-slate-100 p-2"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dragging && move(dragging, st)}
              >
                <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase text-slate-500">
                  {st} <span>{ids.filter((id) => s.pipeline[id] === st).length}</span>
                </div>
                <div className="space-y-2">
                  {ids
                    .filter((id) => s.pipeline[id] === st)
                    .map((id) => {
                      const c = s.companies.find((x) => x.id === id);
                      const sc = s.scores[id];
                      const last = [...s.events].reverse().find((e) => e.companyId === id);
                      return (
                        <div key={id} draggable onDragStart={() => setDragging(id)} className="cursor-grab rounded-md border bg-white p-2 text-xs shadow-sm">
                          <div className="flex items-center justify-between gap-1">
                            <b className="truncate">{c?.name ?? id}</b>
                            {sc && <Badge tone={TIER_TONE[sc.tier]}>{sc.tier}</Badge>}
                          </div>
                          {last && (
                            <div className="mt-1 text-[10px] text-slate-500">
                              <Badge tone={last.actor === "AI" ? "violet" : last.actor === "Simulated" ? "amber" : "sky"} className="px-1.5 py-0 text-[10px]">
                                {last.actor}
                              </Badge>{" "}
                              {new Date(last.ts).toLocaleTimeString()}
                            </div>
                          )}
                          <select className="mt-1 w-full rounded border text-[11px]" value={st} onChange={(e) => move(id, e.target.value as Stage)}>
                            {STAGES.map((x) => (
                              <option key={x}>{x}</option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title="Conversion by stage">
          <ul className="space-y-2 text-sm">
            {funnel.map((f, i) => (
              <li key={f.st} className="flex items-center gap-2">
                <span className="w-32">{f.st}</span>
                <span className="h-2 flex-1 rounded bg-slate-100">
                  <span className="block h-2 rounded bg-indigo-500" style={{ width: pct(f.n, ids.length) === "–" ? 0 : pct(f.n, ids.length) }} />
                </span>
                <span className="w-24 text-right font-mono text-xs">
                  {f.n} {i > 0 ? `(${pct(f.n, funnel[i - 1].n)})` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Conversion by tier">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="text-left">Tier</th>
                <th>Deals</th>
                <th>Contacted</th>
                <th>Reply rate</th>
                <th>Meeting rate</th>
              </tr>
            </thead>
            <tbody className="text-center">
              {tiers.map((t) => (
                <tr key={t.t} className="border-t">
                  <td className="py-1 text-left">
                    <Badge tone={TIER_TONE[t.t]}>{t.t}</Badge>
                  </td>
                  <td>{t.total}</td>
                  <td>{t.contacted}</td>
                  <td>{pct(t.replied, t.contacted)}</td>
                  <td>{pct(t.meetings, t.contacted)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="A/B test: email templates">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="text-left">Template</th>
                <th>Sent</th>
                <th>Reply rate</th>
                <th>Meeting rate</th>
              </tr>
            </thead>
            <tbody className="text-center">
              {ab.map((a) => (
                <tr key={a.v} className="border-t">
                  <td className="py-1 text-left">
                    {a.v} <span className="text-xs text-slate-500">{a.v === "A" ? "signal-led" : "pain-led"}</span>
                  </td>
                  <td>{a.sent}</td>
                  <td>{pct(a.replied, a.sent)}</td>
                  <td>{pct(a.meetings, a.sent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-amber-700">Reply numbers include simulated replies — labelled “Simulated” in the event log.</p>
        </Card>
      </div>

      <Card title="Event log (AI vs Rep vs Simulated)">
        <ul className="max-h-64 space-y-1 overflow-y-auto font-mono text-xs">
          {[...s.events].reverse().map((e, i) => (
            <li key={i}>
              <span className="text-slate-400">{new Date(e.ts).toLocaleTimeString()}</span>{" "}
              <Badge tone={e.actor === "AI" ? "violet" : e.actor === "Simulated" ? "amber" : "sky"}>{e.actor}</Badge> {s.companies.find((c) => c.id === e.companyId)?.name}:{" "}
              {e.from ?? "∅"} → <b>{e.to}</b> {e.note && <span className="text-slate-500">({e.note})</span>}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Usage metered (Flexprice)">
        <div className="flex flex-wrap gap-6 text-sm">
          {Object.entries(s.usage).map(([k, v]) => (
            <div key={k}>
              <div className="font-mono text-xs text-slate-500">{k}</div>
              <div className="text-2xl font-semibold">{v}</div>
            </div>
          ))}
          <div>
            <div className="font-mono text-xs text-slate-500">credit balance</div>
            <div className="text-2xl font-semibold">{data.credits.balance}</div>
            <div className="text-xs text-slate-500">{data.credits.source === "flexprice" ? "Flexprice wallet" : "local demo ledger (Flexprice keys missing)"}</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
