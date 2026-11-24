import { route } from "@/lib/api";
import { reset } from "@/lib/store";
import { clearLocalEvidence } from "@/lib/evidence";

export const POST = route("reset", async (body) => {
  reset(!!body.keepProduct);
  clearLocalEvidence();
  return { ok: true };
});
