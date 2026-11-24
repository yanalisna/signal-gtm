import { route, HttpError } from "@/lib/api";
import { audit, logActivity, reset, update } from "@/lib/store";
import { clearLocalEvidence } from "@/lib/evidence";

export const POST = route("intake", async (body) => {
  const description = String(body.description ?? "").trim();
  if (description.length < 20) throw new HttpError(400, "Please describe the product in at least a sentence or two.");
  if (body.fresh) {
    reset();
    clearLocalEvidence();
  }
  update((s) => {
    s.product = { description, criteria: body.criteria ?? {} };
  });
  audit({ actor: "Rep", action: "intake.saved", target: "product" });
  logActivity({ step: "intake", message: "Product description and criteria saved" });
  return { ok: true };
});
