import { route, HttpError } from "@/lib/api";
import { converseJSON } from "@/lib/bedrock";
import { load, logActivity, uid, update } from "@/lib/store";
import type { ICP } from "@/lib/types";

const SYSTEM = `You are a senior B2B go-to-market strategist specialising in Physical AI, robotics and autonomous systems.
Given a product description and criteria, produce an Ideal Customer Profile.
Every list item carries a "confidence" between 0.00 and 1.00 reflecting how sure you are, based only on the description.
Use real 6-digit 2022 NAICS codes.`;

const SHAPE = `{
  "summary": "one paragraph",
  "industries": [{"naics": "336111", "name": "...", "confidence": 0.85}],
  "sizeTiers": [{"tier": "Mid-market", "employees": "200-1000", "confidence": 0.7}],
  "personas": [{"title": "VP of Autonomy", "seniority": "VP", "department": "Engineering", "role": "economic buyer|champion|user|blocker", "confidence": 0.8}],
  "triggers": [{"event": "Raised Series B+", "why": "...", "confidence": 0.75}],
  "negativeSignals": ["layoffs in last 6 months", "..."],
  "expansionSegments": [{"name": "...", "rationale": "...", "naics": "...", "confidence": 0.5}]
}`;

export const POST = route("icp", async () => {
  const s = load();
  if (!s.product) throw new HttpError(400, "Fill in the intake form first.");
  logActivity({ step: "icp", message: "Generating ICP from product description…" });
  const icp = await converseJSON<ICP>({
    step: "icp",
    system: SYSTEM,
    prompt: `Product description:\n${s.product.description}\n\nCriteria (from the user):\n${JSON.stringify(s.product.criteria, null, 2)}\n\nReturn JSON in exactly this shape (4-6 industries, 2-3 size tiers, 4-6 personas, 4-6 triggers, 3-5 negative signals, 2-3 expansion segments that are adjacent markets beyond the obvious ones):\n${SHAPE}`,
  });
  icp.expansionSegments = (icp.expansionSegments ?? []).map((e) => ({ ...e, id: uid("seg"), status: "proposed" as const }));
  update((st) => {
    st.icp = icp;
  });
  logActivity({
    step: "icp",
    message: `ICP ready: ${icp.industries.length} industries, ${icp.personas.length} personas, ${icp.triggers.length} triggers, ${icp.expansionSegments.length} expansion segments`,
  });
  return { icp };
});
