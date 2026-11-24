import { route, HttpError, pool } from "@/lib/api";
import { converseJSON } from "@/lib/bedrock";
import { fetchPageText } from "@/lib/tavily";
import { retrieveEvidence } from "@/lib/evidence";
import { load, logActivity, update } from "@/lib/store";
import { requireIntegration, requireLLM } from "@/lib/env";

export const maxDuration = 300;

// Reviewer agent: fetch each source URL and ask Bedrock whether it supports the claim.
export const POST = route("reviewer", async () => {
  requireLLM();
  const s = load();
  const todo = s.claims.filter((c) => c.status === "pending");
  if (!todo.length) throw new HttpError(400, "No pending claims. Run discovery first.");
  logActivity({ step: "reviewer", message: `Reviewing ${todo.length} claims against their source pages` });
  const pageCache = new Map<string, Promise<string | null>>();

  const results = await pool(todo, 4, async (cl) => {
    if (!pageCache.has(cl.url)) pageCache.set(cl.url, fetchPageText(cl.url));
    const page = await pageCache.get(cl.url)!;
    const company = s.companies.find((c) => c.id === cl.companyId)?.name ?? "";
    // Ground the reviewer with the most relevant stored evidence (Moss semantic retrieval)
    const ev = await retrieveEvidence(`${company} ${cl.text}`, { k: 3, step: "reviewer" });
    const pageText = page ? page.slice(0, 14000) : null;
    try {
      const v = await converseJSON<{ supported: boolean; confidence: number; quote: string; note: string }>({
        step: "reviewer",
        maxTokens: 600,
        system:
          "You are a strict fact-checking reviewer. Decide if the SOURCE PAGE explicitly supports the CLAIM about the company. If the page could not be fetched, judge only from the search snippet and be conservative (confidence ≤ 0.6).",
        prompt: `COMPANY: ${company}\nCLAIM: ${cl.text}\nSOURCE URL: ${cl.url}\nSEARCH SNIPPET: ${cl.snippet}\n\nSOURCE PAGE ${pageText ? "TEXT" : "(could not be fetched)"}:\n${pageText ?? "-"}\n\nRELATED EVIDENCE (retrieved):\n${ev.hits.map((h) => `- [${h.score.toFixed(2)}] ${h.metadata.url}: ${h.text.slice(0, 300)}`).join("\n")}\n\nReturn {"supported": true|false, "confidence": 0.0-1.0, "quote": "exact supporting sentence from the page or empty", "note": "one line"}`,
      });
      const verified = v.supported && v.confidence >= 0.6;
      return { id: cl.id, status: verified ? ("verified" as const) : ("unverified" as const), note: `${page ? "" : "[page unreachable] "}${v.note}${v.quote ? ` — “${v.quote.slice(0, 200)}”` : ""}`, conf: v.confidence };
    } catch (e) {
      return { id: cl.id, status: "unverified" as const, note: `Reviewer error: ${(e as Error).message}`, conf: 0 };
    }
  });

  update((st) => {
    for (const r of results) {
      const cl = st.claims.find((c) => c.id === r.id);
      if (cl) {
        cl.status = r.status;
        cl.reviewerNote = r.note;
        cl.reviewerConfidence = r.conf;
      }
    }
  });
  const ok = results.filter((r) => r.status === "verified").length;
  logActivity({ step: "reviewer", message: `Reviewer finished: ${ok} verified, ${results.length - ok} unverified` });
  return { verified: ok, unverified: results.length - ok };
});
