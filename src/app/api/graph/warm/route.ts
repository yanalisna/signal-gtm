import { route, HttpError, pool } from "@/lib/api";
import { converseJSON } from "@/lib/bedrock";
import { tavilySearch, type TavilyResult } from "@/lib/tavily";
import { loadTeamHistory } from "@/lib/graph";
import { requireIntegration, requireLLM } from "@/lib/env";
import { load, logActivity, uid, update } from "@/lib/store";
import type { WarmContact, WarmLink } from "@/lib/types";

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
  const perCompany = await pool(targets, 4, async (c) => ({
    c,
    results: await tavilySearch(`${c.name} executive founder former ${employers.join(" OR ")}`, { maxResults: 6, depth: "advanced" }).catch(
      () => [] as TavilyResult[],
    ),
  }));
  const all = perCompany.flatMap(({ c, results }) => results.map((r) => ({ companyId: c.id, company: c.name, url: r.url, title: r.title, content: r.content.slice(0, 900) })));
  if (!all.length) return { found: 0 };

  const out = await converseJSON<{
    people: { companyId: string; name: string; title: string; previousEmployer: string; url: string; quote: string }[];
    orgLinks: { companyId: string; viaOrg: string; relation: string; employer: string; url: string; quote: string }[];
  }>({
    step: "graph",
    maxTokens: 2000,
    system: `You find possible warm-introduction paths from public sources. Our team previously worked at: ${employers.join(", ")}.
1) "people": only if the content EXPLICITLY states BOTH that the person currently works at the target company AND previously worked at one of those employers. "previousEmployer" must be exactly one of those names.
2) "orgLinks": only if the content EXPLICITLY states that the target company's founders or leaders previously worked at an organisation ("viaOrg", not the employer itself) AND explicitly states that viaOrg was backed by, funded by, owned by or partnered with one of those employers ("employer", exact name; "relation" such as "backed by").
Copy the supporting sentence(s) into "quote". Never guess or use outside knowledge; return empty lists if nothing qualifies.`,
    prompt: `Search results (JSON):\n${JSON.stringify(all)}\n\nReturn {"people":[{"companyId":"","name":"","title":"","previousEmployer":"","url":"exact url from results","quote":""}],"orgLinks":[{"companyId":"","viaOrg":"","relation":"","employer":"","url":"exact url from results","quote":""}]}`,
  });

  const urls = new Set(all.map((r) => `${r.companyId} ${r.url}`));
  const found: WarmContact[] = (out.people ?? [])
    .filter((p) => urls.has(`${p.companyId} ${p.url}`) && employers.includes(p.previousEmployer) && p.name && p.quote)
    .map((p) => ({ id: uid("wc"), ...p }));
  const links: WarmLink[] = (out.orgLinks ?? [])
    .filter((l) => urls.has(`${l.companyId} ${l.url}`) && employers.includes(l.employer) && l.viaOrg && l.quote && !employers.includes(l.viaOrg))
    .map((l) => ({ id: uid("wl"), ...l }));
  update((st) => {
    st.warmContacts = found;
    st.warmLinks = links;
  });
  if (links.length)
    logActivity({
      step: "graph",
      message: `Possible org-level paths (verify before use): ${links.map((l) => `${targets.find((t) => t.id === l.companyId)?.name} leaders ex-${l.viaOrg} (${l.relation} ${l.employer})`).join("; ")}`,
    });
  logActivity({
    step: "graph",
    message: `Possible warm paths (verify before use): ${found.length ? found.map((f) => `${f.name} @ ${targets.find((t) => t.id === f.companyId)?.name} (ex-${f.previousEmployer})`).join("; ") : "none found in public sources"}`,
  });
  return { found: found.length, orgLinks: links.length };
});
