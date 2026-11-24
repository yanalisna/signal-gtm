# SIGNAL GTM: AI GTM Engine for Physical AI

SIGNAL GTM turns a plain-language product description into a cited, scored and approved outbound pipeline.
It is built for Physical AI and robotics sellers. The demo product is AI simulation and validation software for autonomous systems.

> Built at an AWS hackathon. Amazon Bedrock (Claude, Converse API) is the reasoning engine. Tavily, Moss, Neo4j, Hunter.io and Flexprice provide data, retrieval, graph, enrichment and billing.

## What it does

| # | Step | What happens | Powered by |
|---|------|--------------|------------|
| 1 | **Intake** | Describe the product in plain language and set criteria (geography, size, budget, exclusions) | — |
| 2 | **ICP** | NAICS industries, size tiers, personas (title and seniority), trigger events, each with a 0.00–1.00 confidence. Also 2–3 expansion segments you can accept, adjust or dismiss | Amazon Bedrock (Claude) |
| 3 | **Discovery** | Finds about 10 real companies with hiring, funding or expansion signals. Every claim stores its source URL. A negative-signal filter excludes companies with layoffs, shutdowns and similar. Includes a competitor map | Tavily + Bedrock |
| 3b | **Reviewer agent** | Fetches each source page and asks Claude whether the page supports the claim, then marks it verified or unverified with a quote | Bedrock + Moss retrieval |
| 4 | **Evidence index** | Every source snippet goes into the Moss index `signal-evidence`. The reviewer and the email drafts are grounded in semantic retrieval. Latency and scores appear in the *Agent thinking* panel | Moss |
| 5 | **Knowledge graph** | Company, Person, Product, Competitor and Signal nodes. A Cypher shortest-path query finds warm intros through the team's real past employers | Neo4j + react-force-graph |
| 6 | **Enrichment** | Hunter domain search and email verifier for the **top 5 leads only**, cached to disk. Each call needs credits | Hunter.io + Flexprice |
| 7 | **Scoring** | **Fit 40 + Signal 40 + Relationship 20 = 0–100**, Tier A/B/C, plus a one-line "why now" with citations | — |
| 8 | **Outreach** | Claude drafts a persona-matched email and one follow-up, using A/B templates. A human must approve, edit or reject each draft; the server enforces this. No real email is sent: "Sent" is an audit-log entry | Bedrock + Moss |
| 9 | **Pipeline** | Kanban: Matched → Contacted → Replied → Meeting Booked → Closed Won/Lost. Every move records whether AI, Rep or Simulated made it, with a timestamp. A clearly labelled **Simulate replies** button. Conversion by stage and tier, and template A vs B | — |
| 10 | **Usage billing** | Meters `leads_enriched`, `outreach_sent` and `graph_queries`. The server checks credits before every Hunter call and blocks with **Top up credits** at zero | Flexprice |

**Graceful degradation:** each integration is optional. If a key is missing, the step shows a clear *"X is not configured, add Y to .env.local"* message and the app keeps working:

- Evidence uses a local lexical index.
- The graph runs in memory.
- Credits use a local demo ledger, clearly labelled.
- If Bedrock is unavailable, LLM calls fall back to **Moss Inference** (an OpenAI-compatible endpoint).

## Run it

Requirements: Node.js 20+ and npm.

```bash
cd signal-gtm
npm install
cp .env.example .env.local   # then paste your own keys into .env.local
npm run dev                  # http://localhost:3000
```

Keys (all optional; see `.env.example`):

| Integration | Variables |
|---|---|
| Amazon Bedrock | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` (if temporary creds), `AWS_REGION`, `BEDROCK_MODEL_ID` |
| Tavily | `TAVILY_API_KEY` |
| Hunter.io | `HUNTER_API_KEY` |
| Neo4j (Aura) | `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD` |
| Flexprice | `FLEXPRICE_API_KEY`, `FLEXPRICE_BASE_URL` (e.g. `https://us.api.flexprice.io/v1`), optional `FLEXPRICE_CUSTOMER_ID` |
| Moss | `MOSS_PROJECT_ID`, `MOSS_PROJECT_KEY` |

`.env.local` is git-ignored. Never commit it.

Warm-intro paths come from `data/team_history.json`. Fill in your team's **real** past employers (with domains) and people you know.

## Demo script (about 3 minutes)

1. **Intake:** the product description is pre-filled. Click *Save & generate ICP*.
2. **ICP:** show the confidence bars. Accept one expansion segment and dismiss another. Click *Find target companies →*.
3. **Discovery:** companies with cited claims appear. Click *Run reviewer*; claims flip to verified or unverified. Point at the *Agent thinking* panel to show Moss retrieval latency and scores. Show the competitor map.
4. **Graph:** click *Sync to Neo4j & find warm paths* to show the force graph and a warm intro through a past employer.
5. **Score & enrich:** show the Tier A/B/C table with "why now" citations. Click *Enrich top 5 with Hunter*: credits go down. Let credits hit zero to show the *Top up credits* block.
6. **Outreach:** approve one draft and edit another. Click *Try sending without approval* to show the server-side block. Then click *Mark as sent (simulated)* on the approved draft and show the audit log.
7. **Pipeline:** click *Simulate replies* (labelled as simulated). Show conversion by stage and tier, the A/B template comparison, and the Flexprice usage meters.

## Project layout

```
src/app/page.tsx              tabbed UI + Agent thinking panel
src/app/api/*/route.ts        one API route per step (server-side logic)
src/lib/bedrock.ts            Bedrock Converse (JSON) + Moss Inference fallback
src/lib/tavily.ts             search, extract, page fetch for the reviewer
src/lib/evidence.ts           Moss "signal-evidence" index + local fallback
src/lib/graph.ts              graph model, Neo4j sync, Cypher warm-path query
src/lib/hunter.ts             domain search + verifier with disk cache
src/lib/flexprice.ts          metering, wallet balance, top-up
src/lib/scoring.ts            Fit/Signal/Relationship scoring
src/lib/store.ts              local JSON state (data/state.json), audit, activity
data/team_history.json        team's real past employers & contacts
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the design.
