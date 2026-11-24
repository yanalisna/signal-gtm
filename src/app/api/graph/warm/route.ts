import { route, HttpError, pool } from "@/lib/api";
import { converseJSON } from "@/lib/bedrock";
import { tavilySearch, type TavilyResult } from "@/lib/tavily";
import { loadTeamHistory } from "@/lib/graph";
import { requireIntegration, requireLLM } from "@/lib/env";
import { load, logActivity, uid, update } from "@/lib/store";
import type { WarmContact } from "@/lib/types";

export const maxDuration = 300;

// Find POSSIBLE warm paths from public web sources only (news, company pages, press releases):
// people at target companies whose public bios mention a prior role at one of our team's past employers.
// Read-only research; nobody is contacted. Every hit is cited and labelled "possible path, verify".
export const POST = route("graph", async () => {
  requireIntegration("tavily");
  requireLLM();
  const s = load();
  const employers = [...new Set(loadTeamHistory().team.flatMap((m) => m.previous_employers.map((e) => e.name)))];
  if (!employers.length) throw new HttpError(400, "Add your past employers to data/team_history.json first.");
  const targets = s.companies.filter((c) => !c.excluded);
  if (!targets.length) throw new HttpError(400, "Run discovery first.");

  logActivity({ step: "graph", message: `Searching public web for people at ${targets.length} targets with prior roles at ${employers.join(" / ")}` });
  const pairs = targets.flatMap((c) => employers.map((e) => ({ c, e })));
  const perCompany = await pool(pairs, 4, async ({ c, e }) => ({
    c,
    results: await tavilySearch(`${c.name} leadership team previously worked at ${e}`, { maxResults: 5 }).catch(() => [] as TavilyResult[]),
  }));
  const all = perCompany.flatMap(({ c, results }) => results.map((r) => ({ companyId: c.id, company: c.name, url: r.url, title: r.title, content: r.content.slice(0, 900) })));
  if (!all.length) return { found: 0 };

  const out = await converseJSON<{ people: { companyId: string; name: string; title: string; previousEmployer: string; url: string; quote: string }[] }>({
    step: "graph",
    maxTokens: 2000,
    system: `You find possible warm-introduction paths from public sources. Only return a person if the given content EXPLICITLY states BOTH that they currently work at the target company AND that they previously worked at one of these employers: ${employers.join(", ")}. "previousEmployer" must be exactly one of those names. Copy the supporting sentence into "quote". Never guess; return an empty list if nothing qualifies.`,
    prompt: `Search results (JSON):\n${JSON.stringify(all)}\n\nReturn {"people":[{"companyId":"","name":"","title":"","previousEmployer":"","url":"exact url from results","quote":""}]}`,
  });

  const urls = new Set(all.map((r) => `${r.companyId} ${r.url}`));
  const found: WarmContact[] = (out.people ?? [])
    .filter((p) => urls.has(`${p.companyId} ${p.url}`) && employers.includes(p.previousEmployer) && p.name && p.quote)
    .map((p) => ({ id: uid("wc"), ...p }));
  update((st) => {
    st.warmContacts = found;
  });
  logActivity({
    step: "graph",
    message: `Possible warm paths (verify before use): ${found.length ? found.map((f) => `${f.name} @ ${targets.find((t) => t.id === f.companyId)?.name} (ex-${f.previousEmployer})`).join("; ") : "none found in public sources"}`,
  });
  return { found: found.length };
});
