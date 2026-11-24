import { route, HttpError } from "@/lib/api";
import { meter } from "@/lib/flexprice";
import { audit, logActivity, update } from "@/lib/store";

// Human-in-the-loop actions. Approval is enforced here, server-side.
export const POST = route("outreach", async (body) => {
  const { id, action } = body as { id: string; action: "approve" | "reject" | "edit" | "send" | "reopen" };
  let companyId = "";
  update((s) => {
    const d = s.drafts.find((x) => x.id === id);
    if (!d) throw new HttpError(404, "Draft not found");
    companyId = d.companyId;
    const now = new Date().toISOString();
    if (action === "edit") {
      if (d.status === "sent") throw new HttpError(409, "Already sent — cannot edit.");
      for (const k of ["subject", "body", "followUpSubject", "followUpBody"] as const) if (typeof body[k] === "string") d[k] = body[k];
      d.status = "draft"; // edits require re-approval
    } else if (action === "approve") {
      if (d.status === "sent") throw new HttpError(409, "Already sent.");
      d.status = "approved";
    } else if (action === "reject") {
      if (d.status === "sent") throw new HttpError(409, "Already sent.");
      d.status = "rejected";
    } else if (action === "reopen") {
      if (d.status !== "rejected") throw new HttpError(409, "Only rejected drafts can be reopened.");
      d.status = "draft";
    } else if (action === "send") {
      if (d.status !== "approved") throw new HttpError(403, "Blocked: a human must approve this draft before it can be sent.");
      d.status = "sent"; // No real email is sent in the MVP.
      const from = s.pipeline[d.companyId] ?? "Matched";
      if (from === "Matched") {
        s.pipeline[d.companyId] = "Contacted";
        s.events.push({ ts: now, companyId: d.companyId, from, to: "Contacted", actor: "Rep", note: `Email sent (variant ${d.variant}) — simulated send` });
      }
    } else throw new HttpError(400, "Unknown action");
    d.updatedAt = now;
  });
  audit({ actor: "Rep", action: `draft.${action}`, target: id, detail: action === "send" ? "status=Sent (no real email sent)" : undefined });
  logActivity({ step: "outreach", message: `Rep ${({approve:"approved",reject:"rejected",edit:"edited",send:"sent (simulated)",reopen:"reopened"} as Record<string,string>)[action]} draft for ${companyId}` });
  if (action === "send") await meter("outreach_sent", { company: companyId });
  return { ok: true };
});
