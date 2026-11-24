import { route, HttpError } from "@/lib/api";
import { buildGraph, warmPath } from "@/lib/graph";
import { scoreCompany } from "@/lib/scoring";
import { load, logActivity, update } from "@/lib/store";
import type { Score } from "@/lib/types";

export const POST = route("scoring", async () => {
  const s = load();
  const targets = s.companies.filter((c) => !c.excluded);
  if (!targets.length) throw new HttpError(400, "Run discovery first.");
  const g = buildGraph(s);
  const scores: Record<string, Score> = {};
  for (const c of targets) {
    const wp = await warmPath(c.id, g);
    scores[c.id] = scoreCompany(s, c.id, wp.path);
  }
  update((st) => {
    st.scores = scores;
  });
  const tiers = Object.values(scores).reduce((a, x) => ({ ...a, [x.tier]: (a[x.tier] ?? 0) + 1 }), {} as Record<string, number>);
  logActivity({ step: "scoring", message: `Scored ${targets.length} companies (Fit 40 / Signal 40 / Relationship 20): A=${tiers.A ?? 0} B=${tiers.B ?? 0} C=${tiers.C ?? 0}` });
  return { scores };
});
