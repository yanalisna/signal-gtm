import { route, HttpError, pool } from "@/lib/api";
import { converseJSON } from "@/lib/bedrock";
import { tavilySearch, type TavilyResult } from "@/lib/tavily";
import { indexEvidence } from "@/lib/evidence";
import { load, logActivity, slug, uid, update } from "@/lib/store";
import { requireIntegration, requireLLM } from "@/lib/env";
import type { Claim, Company, Competitor, SignalType } from "@/lib/types";

export const maxDuration = 300;

interface Extracted {
  companies: {
    name: string;
    domain: string;
    description: string;
    industry: string;
    sizeEstimate: string;
    fit: number;
    fitReason: string;
    negativeSignal: string | null;
    claims: { text: string; signalType: SignalType; url: string; snippet: string }[];
  }[];
}

export const POST = route("discovery", async () => {
  requireIntegration("tavily");
  requireLLM();
  const s = load();
  if (!s.icp || !s.product) throw new HttpError(400, "Generate the ICP first.");
  const icp = s.icp;
  const year = new Date().getFullYear();

  const queries = [
    ...icp.industries.slice(0, 2).map((i) => `${i.name} startup raises funding ${year}`),
    ...icp.triggers.slice(0, 2).map((t) => `${t.event} ${icp.industries[0]?.name ?? "robotics"} company`),
    `autonomous systems robotics company hiring simulation validation engineers ${year}`,
    ...icp.expansionSegments.filter((e) => e.status === "accepted").map((e) => `${e.name} company funding expansion ${year}`),
  ].slice(0, 7);

  logActivity({ step: "discovery", message: `Running ${queries.length} Tavily searches for hiring / funding / expansion signals` });
  const batches = await pool(queries, 3, (q) => tavilySearch(q, { maxResults: 8, topic: "news", days: 240 }).catch(() => [] as TavilyResult[]));
  const seen = new Set<string>();
  const results = batches.flat().filter((r) => (seen.has(r.url) ? false : (seen.add(r.url), true))).slice(0, 36);
  if (!results.length) throw new HttpError(502, "Tavily returned no results.");

  const extracted = await converseJSON<Extracted>({
    step: "discovery",
    maxTokens: 8000,
    system: `You are a B2B research analyst. Extract real target companies (the subject of the news, never the publisher or an investor) that match the ICP.
Only make claims that are directly stated in the given search result content, and cite the exact result URL. Never invent URLs.
Set "negativeSignal" ONLY when a search result explicitly states a negative event about that company (layoffs, shutdown, bankruptcy, hiring freeze, acquisition closing, or an item from the ICP's negative-signal list). Never set it from assumptions, reputation or missing information; put such doubts in "fitReason" and lower "fit" instead.`,
    prompt: `ICP:\n${JSON.stringify({ summary: icp.summary, industries: icp.industries, sizeTiers: icp.sizeTiers, triggers: icp.triggers, negativeSignals: icp.negativeSignals })}

Our product: ${s.product.description}

Search results (JSON):
${JSON.stringify(results.map((r, i) => ({ i, url: r.url, title: r.title, content: r.content.slice(0, 900), published: r.published_date })))}

Return 8-10 distinct companies if the results support them (fewer only if not), best fit first, as:
{"companies":[{"name":"","domain":"company.com","description":"one line","industry":"","sizeEstimate":"e.g. 50-200","fit":0.0-1.0,"fitReason":"one line vs ICP","negativeSignal":null or "reason","claims":[{"text":"short factual claim","signalType":"funding|hiring|expansion|product_launch|partnership|negative|other","url":"exact url from results","snippet":"supporting sentence copied from the content"}]}]}`,
  });

  const urlSet = new Set(results.map((r) => r.url));
  const companies: Company[] = [];
  const claims: Claim[] = [];
  for (const c of extracted.companies ?? []) {
    const id = "c_" + slug(c.name);
    if (companies.some((x) => x.id === id)) continue;
    const validClaims = (c.claims ?? []).filter((cl) => urlSet.has(cl.url));
    if (!validClaims.length) continue;
    companies.push({
      id,
      name: c.name,
      domain: (c.domain || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase(),
      description: c.description,
      industry: c.industry,
      sizeEstimate: c.sizeEstimate,
      fit: Number(c.fit) || 0,
      fitReason: c.fitReason,
      excluded: c.negativeSignal || undefined,
    });
    for (const cl of validClaims) claims.push({ id: uid("cl"), companyId: id, ...cl, status: "pending" });
  }
  const excluded = companies.filter((c) => c.excluded).length;
  logActivity({
    step: "discovery",
    message: `Extracted ${companies.length} companies with ${claims.length} cited claims; negative-signal filter excluded ${excluded}`,
  });

  update((st) => {
    st.companies = companies;
    st.claims = claims;
    st.scores = {};
    st.pipeline = Object.fromEntries(companies.filter((c) => !c.excluded).map((c) => [c.id, "Matched" as const]));
    st.events = companies
      .filter((c) => !c.excluded)
      .map((c) => ({ ts: new Date().toISOString(), companyId: c.id, from: null, to: "Matched" as const, actor: "AI" as const, note: "ICP match" }));
  });

  // Evidence index: every scraped snippet (company-linked claims + raw results)
  await indexEvidence([
    ...claims.map((cl) => ({
      id: cl.id,
      text: `${cl.text}. ${cl.snippet}`,
      metadata: { url: cl.url, companyId: cl.companyId, company: companies.find((c) => c.id === cl.companyId)!.name, signalType: cl.signalType },
    })),
    ...results.map((r, i) => ({
      id: `res_${i}_${slug(r.url).slice(0, 20)}`,
      text: `${r.title}. ${r.content.slice(0, 1200)}`,
      metadata: { url: r.url, companyId: "", company: "", signalType: "search_result" },
    })),
  ]);

  // Competitor map
  try {
    const compResults = await tavilySearch(
      `${icp.industries[0]?.name ?? "autonomous systems"} simulation and validation software vendors competitors`,
      { maxResults: 8 },
    );
    const comp = await converseJSON<{ competitors: Competitor[] }>({
      step: "competitors",
      system: "You are a competitive intelligence analyst. Use only the given search results. Cite exact URLs.",
      prompt: `Our product: ${s.product.description}\n\nSearch results:\n${JSON.stringify(compResults.map((r) => ({ url: r.url, title: r.title, content: r.content.slice(0, 700) })))}\n\nReturn {"competitors":[{"name":"","url":"exact source url","positioning":"one line","overlap":"high|medium|low + why","differentiator":"how we win, one line"}]} with 4-6 vendors.`,
    });
    const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
    const compNames = (comp.competitors ?? []).map((c) => norm(c.name));
    const dropped: string[] = [];
    update((st) => {
      st.competitors = comp.competitors ?? [];
      // A vendor on our competitor map is not a target account.
      for (const c of st.companies) {
        if (!c.excluded && compNames.some((n) => n.includes(norm(c.name)) || norm(c.name).includes(n))) {
          c.excluded = "Competitor: appears on our competitor map";
          delete st.pipeline[c.id];
          st.events = st.events.filter((e) => e.companyId !== c.id);
          dropped.push(c.name);
        }
      }
    });
    if (dropped.length) logActivity({ step: "competitors", message: `Excluded from targets (on competitor map): ${dropped.join(", ")}` });
    logActivity({ step: "competitors", message: `Competitor map: ${comp.competitors?.length ?? 0} vendors` });
  } catch (e) {
    logActivity({ step: "competitors", message: `Competitor map failed: ${(e as Error).message}`, level: "warn" });
  }

  return { companies: companies.length, claims: claims.length, excluded };
});
