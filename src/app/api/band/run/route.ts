import { route, HttpError } from "@/lib/api";
import { BandError, bandLogActivity, bandStatus, getRoom, say, step } from "@/lib/band";
import { audit, load } from "@/lib/store";

export const maxDuration = 120;

const SECRET_RE = /(AKIA[0-9A-Z]{12,}|sk-[A-Za-z0-9]{16,}|api[_-]?key\s*[:=]|password\s*[:=]|-----BEGIN)/i;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/;
const PHONE_RE = /\+?\d[\d\s().-]{8,}\d/;

// Runs the multi-agent handoff in the Band room from the current pipeline state:
// Planner -> Builder -> Reviewer -> Builder -> Security -> human approval by @mention.
export const POST = route("band", async () => {
  const st = bandStatus();
  if (!st.configured) throw new HttpError(400, `Band is not configured. Add ${st.missing.join(", ")} to .env.local and save.`);
  const s = load();
  if (!s.icp || !s.companies.length) throw new HttpError(400, "Run the pipeline first (ICP and discovery), or click Load demo run.");
  try {
    const room = await getRoom(true);
    bandLogActivity(`Band room "${room.title ?? room.chatId}": ${room.participants.length} participants`);

    const targets = s.companies.filter((c) => !c.excluded);
    const excluded = s.companies.filter((c) => c.excluded);
    const verified = s.claims.filter((c) => c.status === "verified").length;
    const drafts = s.drafts.filter((d) => d.status === "draft");
    const name = (id: string) => s.companies.find((c) => c.id === id)?.name ?? id;
    const accepted = s.icp.expansionSegments.filter((x) => x.status === "accepted").map((x) => x.name);

    // Planner
    await step(
      "planner",
      `Plan: ICP -> discovery -> verification -> outreach drafts -> security check -> human approval. ICP has ${s.icp.industries.length} industries, ${s.icp.personas.length} personas, ${s.icp.triggers.length} triggers.`,
      "task",
    );
    await say(
      "planner",
      `ICP is ready (top industry: ${s.icp.industries[0]?.name}; buyer: ${s.icp.personas[0]?.title}). Accepted expansion: ${accepted.join(", ") || "none"}. Please find companies with funding, hiring or expansion signals.`,
      ["builder"],
    );

    // Builder: discovery
    await step("builder", `Tavily search + LLM extraction; every claim must cite a URL from the results. Evidence indexed into Moss "signal-evidence".`);
    await say(
      "builder",
      `Found ${s.companies.length} companies with ${s.claims.length} cited claims. ${excluded.length ? `Excluded: ${excluded.map((c) => `${c.name} (${c.excluded})`).join("; ")}. ` : ""}Targets: ${targets.map((c) => c.name).join(", ")}. Please verify the claims.`,
      ["reviewer"],
    );

    // Reviewer
    await step("reviewer", `Fetched each source page, retrieved related evidence from Moss, asked the LLM whether the page explicitly supports the claim.`);
    const unv = s.claims.filter((c) => c.status === "unverified");
    await say(
      "reviewer",
      `${verified}/${s.claims.length} claims verified against their source pages${unv.length ? `; unverified: ${[...new Set(unv.map((c) => name(c.companyId)))].join(", ")} (count at 30% in the Signal score)` : ""}. Scores are in. Please draft outreach for the top accounts.`,
      ["builder"],
    );

    // Builder: drafts
    const top = Object.values(s.scores).sort((a, b) => b.total - a.total).slice(0, 3);
    await step("builder", `Drafted persona-matched emails + day-4 follow-ups grounded in Moss-retrieved evidence; templates A (signal-led) / B (pain-led).`);
    await say(
      "builder",
      `${s.drafts.length} drafts ready (${drafts.length} awaiting approval). Top accounts: ${top.map((t) => `${name(t.companyId)} ${t.total} (Tier ${t.tier})`).join(", ")}. Please run the security check before anything goes to a human.`,
      ["security"],
    );

    // Security
    const findings: string[] = [];
    for (const d of drafts) {
      const text = `${d.subject}\n${d.body}\n${d.followUpSubject}\n${d.followUpBody}`;
      if (SECRET_RE.test(text)) findings.push(`${name(d.companyId)}: possible secret in text`);
      if (EMAIL_RE.test(text) || PHONE_RE.test(text)) findings.push(`${name(d.companyId)}: contact data inside the email body`);
      if (!d.citations.length) findings.push(`${name(d.companyId)}: no cited evidence`);
    }
    await step(
      "security",
      `Checked ${drafts.length} pending drafts for secrets, personal data in the body, and missing citations. Server-side gate: send returns 403 unless a human approved.`,
    );
    const list = drafts.map((d) => name(d.companyId));
    await say(
      "security",
      `Security check ${findings.length ? `found ${findings.length} issue(s): ${findings.join("; ")}` : "passed: no secrets, no personal data in email bodies, every draft cites evidence"}. Nothing is sent without you. Pending: ${list.join(", ") || "none"}. To approve, reply "@Security approve <company>" (or "reject <company>").`,
      ["human"],
    );
    audit({ actor: "AI", action: "band.run", target: room.chatId, detail: `${drafts.length} drafts awaiting human approval` });
    bandLogActivity(`Band agents posted the handoff (Planner -> Builder -> Reviewer -> Builder -> Security -> human)`);
    return { ok: true, room: room.title ?? room.chatId, pending: list };
  } catch (e) {
    if (e instanceof BandError) throw new HttpError(e.status >= 500 ? 502 : e.status, e.message);
    throw e;
  }
});
