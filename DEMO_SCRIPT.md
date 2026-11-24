# SIGNAL GTM: demo video script (about 3 minutes)

**Before recording**
- Run `npm run dev -- -p 3005` and open http://localhost:3005.
- Click **Load demo run** in the header, so every tab shows the saved live run and nothing depends on Wi-Fi.
- Keep the **Agent thinking** panel open on the right.
- Browser zoom 110–125% so text is readable in the video.

---

### 0:00–0:15 · Hook (Intake tab)
**Show:** the Intake tab with the product description.
**Say:** "I spent 6+ years in autonomous mobility (CARIAD/Volkswagen, and Verizon C-V2X at GlobalLogic), and I saw how hard it is to sell into it. Selling Physical AI is hard. The buyers are a few hundred robotics and autonomy teams, and the right moment to reach them is a funding round or a hiring push. SIGNAL GTM turns one paragraph about your product into a cited, scored and human-approved pipeline."

### 0:15–0:35 · ICP (tab 2)
**Click:** *2 ICP*.
**Show:** NAICS industries, personas and triggers with confidence bars, then the expansion segments.
**Say:** "Claude builds the ideal customer profile, and every line carries a confidence score. It also proposes adjacent markets. I accepted defense and public-sector autonomy and dismissed the others, and every decision is audited."

### 0:35–1:05 · Discovery, reviewer and Moss (tab 3)
**Click:** *3 Discovery*.
**Show:** the company list with claims and source links (Waabi, Bedrock Robotics, TerraFirma, Nuro…), the excluded companies, and the competitor map.
**Say:** "Tavily searches the live web for funding, hiring and expansion signals. Every claim keeps its source URL, and the negative-signal filter dropped three companies."
**Point at:** the verified and unverified badges, then the **Agent thinking** panel showing *Moss retrieval ("signal-evidence")* with scores and latency.
**Say:** "Then a separate reviewer agent re-reads each source page and checks the claim. It's grounded by Moss: every snippet goes into our own Moss index, and semantic retrieval comes back in milliseconds. If a page can't be read, the claim stays unverified. No source, no claim."

### 1:05–1:20 · Graph (tab 4)
**Click:** *4 Graph*.
**Show:** the force graph and the Cypher query.
**Say:** "Everything lands in a Neo4j knowledge graph: companies, people, signals and competitors. A Cypher shortest-path query looks for warm intros through my real past employers. It found one: Stack AV's founders ran Argo AI, which Volkswagen backed, so there's a possible path through my CARIAD/VW network. It's cited and flagged 'verify'. When a path comes from the public web, it's cited and marked *possible path, verify*."

### 1:20–1:45 · Score, enrich, credits (tab 5–6)
**Click:** *5–6 Score & enrich*.
**Show:** the Tier A/B/C table with *Fit 40 / Signal 40 / Relationship 20* and the "why now" citations.
**Say:** "Each account gets a 0–100 score and a one-line why-now with citations. Hunter finds and verifies the right contact, but only for the top 5, because enrichment costs money."
**Point at:** the credits badge.
**Say:** "Usage is metered in Flexprice. The server checks credits before every Hunter call; at zero it blocks with *Top up credits*."
*(Optional live moment: show the **Top up credits** button.)*

### 1:45–2:10 · Human-in-the-loop outreach (tab 7)
**Click:** *7 Outreach*.
**Show:** a draft, its follow-up, and the "Grounded in" evidence links.
**Say:** "Claude drafts a persona-matched email and a follow-up, grounded in evidence retrieved from Moss. Nothing goes out without a human."
**Click:** *Try sending without approval* to show the red *Blocked* message.
**Say:** "The server enforces approval, not just the UI. Approve, send, and it's in the audit log."

### 2:10–2:30 · Band multi-agent room (tab "Band agents")
**Click:** *Band agents*.
**Show:** the agent stream (Planner → Builder → Reviewer → Security → you) and the green approval entry. Optionally switch to the Band room in app.band.ai.
**Say:** "Behind the scenes, four Band agents (Planner, Builder, Reviewer and Security) hand off by @mention in a shared Band room. Security checks every draft for secrets and personal data, then asks me. I approve right in Band with '@Security approve Waabi', and the app records 'approved via Band' in the audit log."

### 2:30–2:50 · Pipeline (tab 8)
**Click:** *8 Pipeline*.
**Show:** the Kanban with AI / Rep / Simulated badges, conversion by stage and tier, the A vs B templates, and Flexprice usage.
**Say:** "Every move is timestamped as AI, Rep or Simulated. For the demo, replies are simulated and labelled that way. We track conversion by stage and tier, and A/B test the two templates."

### 2:50–3:00 · Close
**Say:** "SIGNAL GTM: real signals, verified sources, human approval, usage-based billing. Built today on AWS with Claude, Moss, Tavily, Neo4j, Hunter, Flexprice and Band."

---

## X post: Moss "Best use" prize

> We built SIGNAL GTM at the AWS hackathon: an AI go-to-market engine for Physical AI 🤖
>
> Moss is its evidence memory. Every web signal (funding, hiring, expansion) goes into our own Moss index, "signal-evidence". A reviewer agent queries it to fact-check claims, and every outreach email is grounded in Moss retrieval, with scores and latency visible live. Moss Inference is also our LLM fallback.
>
> No source → no claim. Human approves every send.
>
> [tag Moss's X account] #hackathon #PhysicalAI

*(About 470 characters. Shorten for a single post, or split into a 2-post thread. Add a 20–30 s screen recording of the Discovery tab plus the Agent thinking panel showing Moss retrieval.)*
