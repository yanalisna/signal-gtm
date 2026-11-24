"use client";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Empty, ErrorBox } from "../ui";
import { post, type StepProps } from "../useApp";

const ROLE_TONE: Record<string, "indigo" | "sky" | "violet" | "red" | "green"> = {
  Planner: "indigo",
  Builder: "sky",
  Reviewer: "violet",
  Security: "red",
};

export function Band({ data, refresh }: StepProps) {
  const band = data.band;
  const log = data.state.bandLog ?? [];
  const pending = data.state.drafts.filter((d) => d.status === "draft").length;
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function run(key: string, url: string) {
    setLoading(key);
    setError(null);
    setInfo(null);
    const r = await post<{ results?: string[]; pending?: string[] }>(url);
    if (!r.ok) setError(r.error!);
    else if (r.data?.results) setInfo(r.data.results.length ? r.data.results.join(" · ") : "No new approvals in the Band room yet.");
    await refresh();
    setLoading(null);
  }

  // While drafts await approval, check the Band room for "@Security approve <company>" every 10 s.
  useEffect(() => {
    if (!band?.configured || !pending) return;
    const t = setInterval(() => post("/api/band/poll").then(refresh), 10000);
    return () => clearInterval(t);
  }, [band?.configured, pending, refresh]);

  return (
    <div className="space-y-5">
      <ErrorBox error={error} />
      {info && <div className="rounded-md bg-slate-100 px-4 py-2 text-xs text-slate-600">{info}</div>}
      <Card
        title="Band · multi-agent room (Planner → Builder → Reviewer → Security → you)"
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={() => run("poll", "/api/band/poll")} loading={loading === "poll"} disabled={!band?.configured}>
              Check Band for approvals
            </Button>
            <Button size="sm" onClick={() => run("run", "/api/band/run")} loading={loading === "run"} disabled={!band?.configured}>
              Post agent run to Band
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {Object.entries(band?.roles ?? {}).map(([r, ok]) => (
            <Badge key={r} tone={ok ? "green" : "amber"}>
              {ok ? "●" : "○"} {r[0].toUpperCase() + r.slice(1)}
            </Badge>
          ))}
          <span className="ml-auto text-xs text-slate-500">
            Approve from Band: reply <code className="rounded bg-slate-100 px-1">@Security approve Kodiak AI</code> in the room
            {pending ? ` · ${pending} draft(s) awaiting approval (auto-checking every 10 s)` : ""}
          </span>
        </div>
        {!band?.configured && (
          <div className="mt-3 text-xs text-amber-700">Band is not configured. Add {band?.missing.join(", ")} to .env.local and save.</div>
        )}
      </Card>

      {!log.length ? (
        <Empty>No Band messages yet. Click “Post agent run to Band” to have the four agents hand off in the room.</Empty>
      ) : (
        <Card title="Agent message stream (mirrored from the Band room)">
          <ul className="space-y-2">
            {log.map((m, i) => (
              <li
                key={i}
                className={
                  m.kind === "approval"
                    ? "rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm"
                    : m.kind === "message"
                      ? "rounded-md border border-slate-200 p-3 text-sm"
                      : "rounded-md bg-slate-50 px-3 py-2 text-xs italic text-slate-500"
                }
              >
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                  <Badge tone={ROLE_TONE[m.from] ?? "green"}>{m.from}</Badge>
                  {m.kind !== "message" && <span className="uppercase text-slate-400">{m.kind}</span>}
                  {m.to?.length ? <span className="text-slate-500">→ {m.to.map((t) => "@" + t).join(" ")}</span> : null}
                  <span className="ml-auto text-slate-400">{new Date(m.ts).toLocaleTimeString()}</span>
                </div>
                <div>{m.content}</div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
