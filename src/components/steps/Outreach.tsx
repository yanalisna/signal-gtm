"use client";
import { useState } from "react";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { Badge, Button, Card, Empty, ErrorBox, TIER_TONE } from "../ui";
import { post, type StepProps } from "../useApp";
import type { Draft } from "@/lib/types";

const STATUS_TONE = { draft: "slate", approved: "indigo", rejected: "red", sent: "green" } as const;

function DraftCard({ d, props, onError }: { d: Draft; props: StepProps; onError: (e: string | null) => void }) {
  const { data, refresh } = props;
  const c = data.state.companies.find((x) => x.id === d.companyId);
  const lead = data.state.leads.find((l) => l.id === d.leadId);
  const sc = data.state.scores[d.companyId];
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ subject: d.subject, body: d.body, followUpSubject: d.followUpSubject, followUpBody: d.followUpBody });
  const [loading, setLoading] = useState<string | null>(null);

  async function act(action: string, extra: object = {}) {
    setLoading(action);
    onError(null);
    const r = await post("/api/outreach/action", { id: d.id, action, ...extra });
    if (!r.ok) onError(r.error!);
    else setEdit(false);
    await refresh();
    setLoading(null);
  }

  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          {c?.name}
          {sc && <Badge tone={TIER_TONE[sc.tier]}>Tier {sc.tier}</Badge>}
          <Badge tone="violet">Template {d.variant}</Badge>
          <Badge tone={STATUS_TONE[d.status]}>{d.status === "sent" ? "Sent (simulated)" : d.status}</Badge>
        </span>
      }
      actions={
        <span className="text-xs text-slate-500">{lead ? `${lead.name} · ${lead.title} · ${lead.email}` : "no verified contact — persona-level draft"}</span>
      }
    >
      {edit ? (
        <div className="space-y-2">
          <input className="w-full rounded border px-3 py-2 text-sm font-medium" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          <textarea className="h-44 w-full rounded border p-3 text-sm" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          <div className="text-xs font-medium text-slate-500">Follow-up (day 4)</div>
          <input className="w-full rounded border px-3 py-2 text-sm" value={form.followUpSubject} onChange={(e) => setForm({ ...form, followUpSubject: e.target.value })} />
          <textarea className="h-24 w-full rounded border p-3 text-sm" value={form.followUpBody} onChange={(e) => setForm({ ...form, followUpBody: e.target.value })} />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => act("edit", form)} loading={loading === "edit"}>
              Save edits
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEdit(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="text-sm font-semibold">{d.subject}</div>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-slate-700">{d.body}</pre>
            <div className="mt-4 border-t pt-3">
              <div className="text-xs font-medium uppercase text-slate-400">Follow-up · day 4</div>
              <div className="text-sm font-semibold">{d.followUpSubject}</div>
              <pre className="mt-1 whitespace-pre-wrap font-sans text-sm text-slate-600">{d.followUpBody}</pre>
            </div>
          </div>
          <div className="space-y-3 text-xs">
            {sc && (
              <div>
                <div className="font-medium text-slate-500">Why now</div>
                <div>{sc.whyNow}</div>
              </div>
            )}
            <div>
              <div className="font-medium text-slate-500">Grounded in (retrieved evidence)</div>
              {d.citations.map((u, i) => (
                <a key={u} href={u} target="_blank" rel="noreferrer" className="flex items-center gap-1 truncate text-indigo-600 hover:underline">
                  [{i + 1}] {u.replace(/^https?:\/\/(www\.)?/, "").slice(0, 48)} <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
      {!edit && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
          {d.status === "draft" && (
            <>
              <Button size="sm" variant="success" onClick={() => act("approve")} loading={loading === "approve"}>
                Approve
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setEdit(true)}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => act("reject")} loading={loading === "reject"}>
                Reject
              </Button>
            </>
          )}
          {d.status === "approved" && (
            <>
              <Button size="sm" onClick={() => act("send")} loading={loading === "send"}>
                Mark as sent (simulated)
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setEdit(true)}>
                Edit
              </Button>
            </>
          )}
          {d.status === "rejected" && (
            <Button size="sm" variant="secondary" onClick={() => act("reopen")}>
              Reopen
            </Button>
          )}
          {d.status === "draft" && (
            <Button size="sm" variant="ghost" className="ml-auto text-slate-400" onClick={() => act("send")} title="Demonstrates the server-side approval check">
              Try sending without approval
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

export function Outreach(props: StepProps) {
  const { data, refresh } = props;
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const drafts = [...data.state.drafts].sort((a, b) => ["draft", "approved", "sent", "rejected"].indexOf(a.status) - ["draft", "approved", "sent", "rejected"].indexOf(b.status));

  return (
    <div className="space-y-5">
      <Card
        title="7 · Outreach — human-in-the-loop queue"
        actions={
          <Button
            size="sm"
            loading={loading}
            onClick={async () => {
              setLoading(true);
              setError(null);
              const r = await post("/api/outreach/draft");
              if (!r.ok) setError(r.error!);
              await refresh();
              setLoading(false);
            }}
          >
            Draft emails for Tier A/B
          </Button>
        }
      >
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          Nothing is sent without a human approval (enforced server-side). No real email is sent in this demo — “sent” is logged to the audit trail.
        </div>
      </Card>
      <ErrorBox error={error} />
      {!drafts.length ? <Empty>No drafts yet.</Empty> : drafts.map((d) => <DraftCard key={d.id} d={d} props={props} onError={setError} />)}
      {data.state.audit.length > 0 && (
        <Card title="Audit log">
          <ul className="max-h-60 space-y-1 overflow-y-auto font-mono text-xs">
            {[...data.state.audit].reverse().map((a, i) => (
              <li key={i}>
                <span className="text-slate-400">{new Date(a.ts).toLocaleTimeString()}</span> <b>{a.actor}</b> {a.action} <span className="text-slate-500">{a.target}</span> {a.detail}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
