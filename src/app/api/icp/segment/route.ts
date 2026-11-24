import { route, HttpError } from "@/lib/api";
import { audit, update } from "@/lib/store";

// accept / adjust / dismiss an expansion segment
export const POST = route("icp", async (body) => {
  const { id, status, name, rationale } = body as { id: string; status?: "accepted" | "dismissed" | "proposed"; name?: string; rationale?: string };
  update((s) => {
    const seg = s.icp?.expansionSegments.find((x) => x.id === id);
    if (!seg) throw new HttpError(404, "Segment not found");
    if (status) seg.status = status;
    if (name) seg.name = name;
    if (rationale) seg.rationale = rationale;
  });
  audit({ actor: "Rep", action: `segment.${status ?? "edited"}`, target: id });
  return { ok: true };
});
