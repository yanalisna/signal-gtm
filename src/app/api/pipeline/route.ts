import { route, HttpError } from "@/lib/api";
import { audit, logActivity, update } from "@/lib/store";
import { STAGES, type Stage } from "@/lib/types";

export const POST = route("pipeline", async (body) => {
  if (body.action === "move") {
    const to = body.to as Stage;
    if (!STAGES.includes(to)) throw new HttpError(400, "Bad stage");
    update((s) => {
      const from = s.pipeline[body.companyId] ?? null;
      if (from === to) return;
      s.pipeline[body.companyId] = to;
      s.events.push({ ts: new Date().toISOString(), companyId: body.companyId, from, to, actor: "Rep" });
    });
    audit({ actor: "Rep", action: "pipeline.move", target: body.companyId, detail: to });
    return { ok: true };
  }
  if (body.action === "simulate") {
    // SIMULATED replies for demo purposes — clearly labelled as actor "Simulated".
    let n = 0;
    update((s) => {
      const now = new Date().toISOString();
      for (const [companyId, stage] of Object.entries(s.pipeline)) {
        const variant = s.drafts.find((d) => d.companyId === companyId && d.status === "sent")?.variant;
        const tier = s.scores[companyId]?.tier ?? "C";
        const base = tier === "A" ? 0.65 : tier === "B" ? 0.45 : 0.25;
        const p = base + (variant === "A" ? 0.1 : 0);
        let to: Stage | null = null;
        if (stage === "Contacted") to = Math.random() < p ? "Replied" : null;
        else if (stage === "Replied") to = Math.random() < p ? "Meeting Booked" : Math.random() < 0.3 ? "Closed Lost" : null;
        else if (stage === "Meeting Booked") to = Math.random() < 0.5 ? "Closed Won" : Math.random() < 0.3 ? "Closed Lost" : null;
        if (to) {
          s.pipeline[companyId] = to;
          s.events.push({ ts: now, companyId, from: stage, to, actor: "Simulated", note: "Simulated reply (demo)" });
          n++;
        }
      }
    });
    logActivity({ step: "pipeline", message: `SIMULATED: advanced ${n} deals (demo data, not real replies)` });
    return { moved: n };
  }
  throw new HttpError(400, "Unknown action");
});
