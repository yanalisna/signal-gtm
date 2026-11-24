import { route, HttpError } from "@/lib/api";
import { domainSearch, verifyEmail, type HunterEmail } from "@/lib/hunter";
import { creditStatus, meter } from "@/lib/flexprice";
import { audit, load, logActivity, uid, update } from "@/lib/store";
import type { Lead } from "@/lib/types";

export const maxDuration = 120;

const SENIORITY_RANK: Record<string, number> = { executive: 3, senior: 2, junior: 0 };

function pickBest(emails: HunterEmail[], personaTitles: string[]): HunterEmail | undefined {
  const words = personaTitles.flatMap((t) => t.toLowerCase().split(/\W+/)).filter((w) => w.length > 3);
  return emails
    .filter((e) => e.first_name && e.position)
    .map((e) => {
      const pos = (e.position ?? "").toLowerCase();
      const titleHits = words.filter((w) => pos.includes(w)).length;
      return { e, score: titleHits * 2 + (SENIORITY_RANK[e.seniority ?? ""] ?? 1) + e.confidence / 100 };
    })
    .sort((a, b) => b.score - a.score)[0]?.e;
}

// Enrich the top 5 leads only (Hunter free tier is tiny; results cached on disk).
export const POST = route("enrichment", async () => {
  const s = load();
  const ranked = s.companies
    .filter((c) => !c.excluded && c.domain)
    .sort((a, b) => (s.scores[b.id]?.total ?? b.fit * 40) - (s.scores[a.id]?.total ?? a.fit * 40))
    .slice(0, 5);
  if (!ranked.length) throw new HttpError(400, "Run discovery (and scoring) first.");
  const personaTitles = (s.icp?.personas ?? []).map((p) => p.title);
  const leads: Lead[] = [];
  const skipped: string[] = [];

  for (const c of ranked) {
    if (s.leads.some((l) => l.companyId === c.id)) continue; // already enriched
    // Credit gate: check balance server-side BEFORE every Hunter call
    const credits = await creditStatus();
    if (!credits.ok) {
      // keep the leads enriched before we ran out
      update((st) => {
        st.leads.push(...leads);
      });
      logActivity({
        step: "enrichment",
        message: `Enriched ${leads.length} leads, then blocked: no credits left (${credits.source}). Top up credits to continue.`,
        level: "warn",
      });
      throw new HttpError(402, `Top up credits — balance is ${credits.balance} (${credits.source}). ${credits.error ?? ""}`.trim());
    }
    try {
      const { emails, cached } = await domainSearch(c.domain);
      const best = pickBest(emails, personaTitles);
      if (!best) {
        skipped.push(`${c.name}: no named contacts found`);
        continue;
      }
      const v = await verifyEmail(best.value);
      const lead: Lead = {
        id: uid("lead"),
        companyId: c.id,
        name: `${best.first_name} ${best.last_name ?? ""}`.trim(),
        title: best.position ?? "",
        email: best.value,
        confidence: best.confidence,
        verification: v.status,
        linkedin: best.linkedin ?? undefined,
      };
      leads.push(lead);
      await meter("leads_enriched", { domain: c.domain, cached: String(cached) }); // billed per lead, cache only saves our Hunter cost
      audit({ actor: "AI", action: "lead.enriched", target: c.name, detail: `${lead.title} (${v.status})${cached ? " [cache]" : ""}` });
    } catch (e) {
      skipped.push(`${c.name}: ${(e as Error).message}`);
      if ((e as Error).name === "MissingKeyError" || (e as { keys?: unknown }).keys) throw e;
    }
  }
  update((st) => {
    st.leads.push(...leads);
  });
  logActivity({ step: "enrichment", message: `Enriched ${leads.length} leads${skipped.length ? `; skipped: ${skipped.join("; ")}` : ""}` });
  return { leads: leads.length, skipped };
});
