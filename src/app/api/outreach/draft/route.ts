import { route, HttpError, pool } from "@/lib/api";
import { converseJSON } from "@/lib/bedrock";
import { retrieveEvidence } from "@/lib/evidence";
import { audit, load, logActivity, uid, update } from "@/lib/store";
import { requireIntegration, requireLLM } from "@/lib/env";
import type { Draft } from "@/lib/types";

export const maxDuration = 300;

function personaStyle(title: string) {
  const t = title.toLowerCase();
  if (/(chief|ceo|cto|founder|president|vp|vice president|head)/.test(t))
    return { tone: "executive: crisp, outcome-focused, no jargon", words: 80, cta: "a 15-minute call next week" };
  if (/(director|manager|lead)/.test(t))
    return { tone: "practical: team velocity, risk reduction, peer proof", words: 110, cta: "a 20-minute walkthrough with their team" };
  return { tone: "technical: specific about simulation fidelity, scenario coverage, CI integration", words: 130, cta: "access to a sandbox with their own scenarios" };
}

const TEMPLATES = {
  A: "Template A — signal-led: open with the specific timely signal (cite it), connect it to a validation bottleneck, then the CTA.",
  B: "Template B — pain-led: open with a sharp question about the safety/validation pain this persona feels, then mention the signal as context, then the CTA.",
};

export const POST = route("outreach", async (body) => {
  requireLLM();
  const s = load();
  if (!s.product) throw new HttpError(400, "Intake missing.");
  const only: string[] | undefined = body.companyIds;
  const targets = s.companies
    .filter((c) => !c.excluded && s.scores[c.id] && (only ? only.includes(c.id) : s.scores[c.id].tier !== "C" || s.leads.some((l) => l.companyId === c.id)))
    .filter((c) => !s.drafts.some((d) => d.companyId === c.id && d.status !== "rejected"))
    .slice(0, 8);
  if (!targets.length) throw new HttpError(400, "No scored companies without drafts. Run scoring first (Tier A/B or enriched).");

  const drafts = await pool(targets, 3, async (c, i): Promise<Draft> => {
    const lead = s.leads.find((l) => l.companyId === c.id);
    const persona = lead?.title ?? s.icp?.personas[0]?.title ?? "VP of Engineering";
    const style = personaStyle(persona);
    const variant: "A" | "B" = (s.drafts.length + i) % 2 === 0 ? "A" : "B";
    const score = s.scores[c.id];
    // RAG: ground the email in retrieved evidence for this company
    const ev = await retrieveEvidence(`${c.name} ${score.whyNow} ${persona}`, { k: 4, companyId: c.id, step: "outreach" });
    const claims = s.claims.filter((x) => x.companyId === c.id && x.status === "verified");
    const out = await converseJSON<{ subject: string; body: string; followUpSubject: string; followUpBody: string }>({
      step: "outreach",
      temperature: 0.5,
      maxTokens: 1500,
      system:
        "You write short, personalised B2B cold emails that a busy person would actually reply to. Only reference facts present in the EVIDENCE; never invent metrics, customers or quotes. Plain text, no emojis, sign off as '{{sender_name}}'.",
      prompt: `OUR PRODUCT: ${s.product!.description}
RECIPIENT: ${lead ? `${lead.name}, ${lead.title}` : `the ${persona}`} at ${c.name} (${c.description})
WHY NOW: ${score.whyNow}
WARM PATH: ${score.warmPath ? score.warmPath.join(" → ") : "none"}
${TEMPLATES[variant]}
TONE: ${style.tone}. LENGTH: max ${style.words} words. CTA: ${style.cta}.
EVIDENCE (retrieved):\n${ev.hits.map((h) => `- ${h.metadata.url}: ${h.text.slice(0, 400)}`).join("\n") || "-"}
VERIFIED CLAIMS:\n${claims.map((x) => `- ${x.text} (${x.url})`).join("\n") || "-"}

Also write ONE follow-up email (max 60 words) to send 4 days later if no reply, adding one new angle.
Return {"subject":"","body":"","followUpSubject":"","followUpBody":""}`,
    });
    const now = new Date().toISOString();
    return {
      id: uid("dr"),
      companyId: c.id,
      leadId: lead?.id,
      variant,
      ...out,
      citations: [...new Set([...ev.hits.map((h) => h.metadata.url), ...claims.map((x) => x.url)])].slice(0, 4),
      status: "draft",
      createdAt: now,
      updatedAt: now,
    };
  });

  update((st) => {
    st.drafts.push(...drafts);
  });
  drafts.forEach((d) => audit({ actor: "AI", action: "draft.created", target: d.id, detail: `variant ${d.variant}` }));
  logActivity({ step: "outreach", message: `Drafted ${drafts.length} emails + follow-ups; awaiting human approval` });
  return { drafts: drafts.length };
});
