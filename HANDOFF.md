# SIGNAL GTM: handoff for a new collaborator

This is the starting point for anyone picking the project up at the next hackathon. Read it first, then [README.md](README.md) (feature tour and demo script) and [ARCHITECTURE.md](ARCHITECTURE.md) (design and data flow).

## What the app does

SIGNAL GTM is an AI go-to-market engine for Physical AI and robotics sellers. You describe a product in plain language. The app then:

1. builds an ICP (industries, personas, triggers),
2. finds real target companies, with a cited source for every claim,
3. has a reviewer agent check each claim against its source page,
4. maps warm-intro paths through a knowledge graph of the team's past employers,
5. enriches the top leads and scores them (Fit 40 + Signal 40 + Relationship 20, Tier A/B/C),
6. drafts outreach that a human must approve before it counts as sent,
7. tracks deals on a pipeline board and meters usage for billing.

An optional Band multi-agent room (Planner, Builder, Reviewer, Security) runs the same flow, with human approval given through @mentions.

## Run it locally

- **Node.js:** 20 or newer. It was developed on Node 24.
- **Package manager:** npm, using the committed `package-lock.json`.

```bash
git clone https://github.com/yanalisna/signal-gtm.git
cd signal-gtm
npm install
cp .env.example .env.local      # fill in your own keys; see the next section
npm run dev -- -p 3005          # open http://localhost:3005
```

Every integration is optional. With no keys at all, the UI still loads and each step tells you which variable it is missing. For a useful live run you need at least an LLM (Bedrock or Moss) and Tavily.

> **Next.js note:** this project uses a recent Next.js with breaking changes from older versions. Before you change routing or config, check `node_modules/next/dist/docs/` (see `AGENTS.md`).

## Environment variables

Put these in `.env.local`, which is git-ignored. Never commit real values.

| Variable | What it is | Where to get it |
|---|---|---|
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | AWS credentials for Bedrock | AWS console → IAM, or temporary credentials from the event's AWS account |
| `AWS_SESSION_TOKEN` | Needed only with temporary credentials | Same place as the temporary keys |
| `AWS_REGION` | Bedrock region (default `us-east-1`) | A region where your account has Bedrock model access |
| `BEDROCK_MODEL_ID` | Claude model or inference-profile ID | Bedrock console → Model access / Inference profiles |
| `TAVILY_API_KEY` | Web search and extract | app.tavily.com → API keys |
| `HUNTER_API_KEY` | Email domain search and verifier | hunter.io → Dashboard → API |
| `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD` | Graph database | console.neo4j.io → create an AuraDB Free instance; the connection details are shown once, at creation |
| `FLEXPRICE_API_KEY` | Usage metering and credits | Flexprice dashboard → Developers / API keys |
| `FLEXPRICE_BASE_URL` | Optional; defaults to `https://us.api.flexprice.io/v1` | Flexprice docs (EU/CA/IN hosts) |
| `FLEXPRICE_CUSTOMER_ID` | Optional customer external ID (default `signal-gtm-demo`) | Any ID you create as a customer in Flexprice |
| `MOSS_PROJECT_ID`, `MOSS_PROJECT_KEY` | Evidence index, plus the fallback LLM (Moss Inference) | Moss dashboard → project settings |
| `BAND_PLANNER_AGENT_ID`, `BAND_PLANNER_API_KEY` | Band Planner agent | app.band.ai → Agents → *Connect remote agent* |
| `BAND_BUILDER_AGENT_ID`, `BAND_BUILDER_API_KEY` | Band Builder agent | Same place |
| `BAND_REVIEWER_AGENT_ID`, `BAND_REVIEWER_API_KEY` | Band Reviewer agent | Same place |
| `BAND_SECURITY_AGENT_ID`, `BAND_SECURITY_API_KEY` | Band Security agent | Same place |
| `BAND_ROOM_ID` | Optional room ID; if empty, the Planner's first room is used | Band room URL, or leave empty |

For Band, also create a room and add all four agents to it.

## Where things live

[ARCHITECTURE.md](ARCHITECTURE.md) has the full design. Key files for each step:

| Step | UI | API route | Library |
|---|---|---|---|
| Intake | `src/components/steps/Intake.tsx` | `src/app/api/intake/route.ts` | `src/lib/store.ts` |
| ICP | `src/components/steps/Icp.tsx` | `src/app/api/icp/route.ts`, `icp/segment/route.ts` | `src/lib/bedrock.ts` |
| Discovery and reviewer | `src/components/steps/Discovery.tsx` | `src/app/api/discover/route.ts`, `verify/route.ts` | `src/lib/tavily.ts`, `src/lib/evidence.ts` |
| Graph and warm paths | `src/components/steps/Graph.tsx` | `src/app/api/graph/route.ts`, `graph/warm/route.ts` | `src/lib/graph.ts`, `data/team_history.json` |
| Score and enrich | `src/components/steps/Leads.tsx` | `src/app/api/score/route.ts`, `enrich/route.ts` | `src/lib/scoring.ts`, `src/lib/hunter.ts` |
| Outreach | `src/components/steps/Outreach.tsx` | `src/app/api/outreach/draft/route.ts`, `outreach/action/route.ts` | `src/lib/bedrock.ts`, `src/lib/evidence.ts` |
| Pipeline | `src/components/steps/Pipeline.tsx` | `src/app/api/pipeline/route.ts` | `src/lib/store.ts` |
| Billing | header credits | `src/app/api/credits/route.ts` | `src/lib/flexprice.ts` |
| Band agents | `src/components/steps/Band.tsx` | `src/app/api/band/run/route.ts`, `band/poll/route.ts` | `src/lib/band.ts` |
| Shared | `src/app/page.tsx` (tabs, *Agent thinking* panel), `src/components/ui.tsx` | `src/lib/api.ts` (route wrapper) | `src/lib/env.ts` (key checks), `src/lib/types.ts` |

`DEMO_SCRIPT.md` has the stage walkthrough.

## Demo mode

- After a good live run, click **Save as demo** in the header. The app copies `data/state.json` and the Hunter and evidence caches into `data/demo/`.
- **Load demo run** restores that snapshot with no API calls. The graph and warm paths still work if Neo4j is offline, because the app falls back to the in-memory graph.
- `data/demo/`, `data/state.json` and `data/cache/` are git-ignored on purpose: they hold third-party contact data. A fresh clone has no demo snapshot, so make your own with a live run.
- **Reset run** in the header clears the current state.

## Known limits

- **Sending is simulated.** No real email goes out. "Sent" is an audit-log entry, and the server blocks sending unless a human has approved the draft. *Simulate replies* on the pipeline board is clearly labelled demo data.
- **Tier A effectively requires a warm path.** Fit plus Signal max out at 80. In practice, getting past the Tier A threshold of 70 needs Relationship points, which come only from a warm path. With no team-history overlap, most leads land in B/C.
- **Warm paths depend on `data/team_history.json`.** Replace it with your own team's real past employers. Public-web warm paths are labelled *possible path, verify*.
- **Free-tier API limits.** Tavily, Hunter, Neo4j Aura Free and Flexprice all have quotas. Hunter runs only for the top 5 leads and is cached on disk, and a credit gate blocks calls at zero.
- **Fallback LLM.** If Bedrock is unavailable, LLM calls go to Moss Inference. Output quality and JSON reliability can differ.
- **Band approvals use @mentions.** On Band's free tier the human approves by posting `@Security approve <company>` in the room, because the Human API is Enterprise-only. The app polls for these messages, so expect a few seconds of delay.
- **State is a JSON file.** It has a single user and no concurrency control.
- **OneDrive file locking (Windows).** If the repo sits in a OneDrive folder, syncing can lock `data/state.json` or `.next/` files and cause random write errors (`EBUSY`/`EPERM`). Clone outside OneDrive, or pause syncing while you develop.

## Next-step ideas

- **Eval harness:** a small labelled set of products and companies to measure ICP quality, claim precision (supported vs. unsupported) and lead-score ranking, run on every prompt change.
- **Tracing:** structured traces for each agent step (prompt, retrieval, tool calls, latency, cost) instead of the flat activity feed, with OpenTelemetry or a tracing tool.
- **Persistent database:** replace `data/state.json` with SQLite or Postgres (for example via Drizzle or Prisma), so you get multiple runs, multiple users and history.
- **Real sending in a sandbox:** connect an email provider's sandbox or test mode, keep the server-side approval gate, and add unsubscribe and suppression handling.
- **More warm-path sources (no LinkedIn):** conference speaker lists, GitHub org membership, patents, papers and press releases, investor portfolios, and alumni pages. Every source should stay cited and labelled *verify*.
- **Plug in new tools as Band agents:** a collaborator's own tools (data sources, scoring models, research agents) can join as additional Band remote agents in the same room, with @mention handoffs, without touching the core app.

## Ground rules

- Never commit `.env.local`, the `data/demo/` snapshot or any third-party contact data.
- Keep the server-side approval gate on outbound messages.
- Every claim the app shows must keep its source URL.
