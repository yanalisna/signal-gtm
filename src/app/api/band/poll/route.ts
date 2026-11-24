import { route, HttpError } from "@/lib/api";
import { BandError, bandLogActivity, bandStatus, mirror, say, securityInbox } from "@/lib/band";
import { audit, load, update } from "@/lib/store";

// Human-in-the-loop via Band: read messages that @mention the Security agent and apply
// "approve <company>" / "reject <company>" from a HUMAN sender. Enforced here, server-side.
export const POST = route("band", async () => {
  const st = bandStatus();
  if (!st.configured) throw new HttpError(400, `Band is not configured. Add ${st.missing.join(", ")} to .env.local and save.`);
  let msgs;
  try {
    msgs = await securityInbox();
  } catch (e) {
    if (e instanceof BandError) throw new HttpError(e.status >= 500 ? 502 : e.status, e.message);
    throw e;
  }
  const seen = new Set(load().bandSeen ?? []);
  const fresh = msgs.filter((m) => m.sender_type === "User" && !seen.has(m.id) && (m.message_type ?? "text") === "text");
  const results: string[] = [];
  for (const m of fresh) {
    const text = m.content.toLowerCase();
    const verb = /\bapprove/.test(text) ? "approve" : /\breject/.test(text) ? "reject" : null;
    update((s) => {
      s.bandSeen = [...(s.bandSeen ?? []), m.id].slice(-500);
    });
    if (!verb) continue;
    const cur = load();
    const pending = cur.drafts.filter((d) => d.status === "draft");
    const companyName = (id: string) => cur.companies.find((c) => c.id === id)?.name ?? id;
    const hit = pending.filter((d) => {
      const n = companyName(d.companyId).toLowerCase();
      return n && text.includes(n.split(/\s+/)[0]);
    });
    const targets = /\ball\b/.test(text) ? pending : hit;
    if (!targets.length) {
      results.push(`"${m.content.slice(0, 60)}": no matching pending draft`);
      continue;
    }
    update((s) => {
      for (const t of targets) {
        const d = s.drafts.find((x) => x.id === t.id);
        if (d && d.status === "draft") {
          d.status = verb === "approve" ? "approved" : "rejected";
          d.updatedAt = new Date().toISOString();
        }
      }
    });
    const names = targets.map((t) => companyName(t.companyId));
    for (const t of targets) audit({ actor: "Rep", action: `draft.${verb}`, target: t.id, detail: `via Band by ${m.sender_name}` });
    mirror({ from: m.sender_name, kind: "approval", content: m.content.replace(/@\[\[[^\]]+\]\]/g, "@Security") });
    bandLogActivity(`Band: ${m.sender_name} ${verb}d ${names.join(", ")} (human @mention)`);
    results.push(`${verb}d ${names.join(", ")}`);
    await say(
      "security",
      verb === "approve"
        ? `Thanks ${m.sender_name}: ${names.join(", ")} approved. Ready to send (simulated) from the Outreach queue.`
        : `Noted ${m.sender_name}: ${names.join(", ")} rejected. Nothing will be sent.`,
      ["human", "planner"],
    ).catch(() => {});
  }
  return { checked: fresh.length, results };
});
