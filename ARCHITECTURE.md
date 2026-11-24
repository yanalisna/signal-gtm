# SIGNAL GTM: Architecture

## Overview

```
 Browser (Next.js client, tabbed UI)
   │  fetch /api/*                         polls /api/state every 4 s
   ▼                                        (Agent thinking feed, credits, integration status)
 Next.js App Router API routes  ── one route per step, all logic server-side
   │
   ├── lib/bedrock.ts   ──► Amazon Bedrock Runtime · Converse API · Claude (JSON output)
   │                       └► fallback: Moss Inference /v1/chat/completions
   ├── lib/tavily.ts    ──► Tavily Search / Extract (+ direct page fetch for the reviewer)
   ├── lib/evidence.ts  ──► Moss index "signal-evidence" (createIndex / addDocs / loadIndex / query)
   │                       └► fallback: local lexical index (data/cache/evidence.json)
   ├── lib/graph.ts     ──► Neo4j (MERGE nodes/rels, Cypher shortestPath warm intros)
   │                       └► fallback: in-memory graph + BFS
   ├── lib/hunter.ts    ──► Hunter.io domain-search + email-verifier (disk-cached)
   ├── lib/flexprice.ts ──► Flexprice events / customer / wallet / top-up
   │                       └► fallback: labelled local credit ledger
   └── lib/store.ts     ──► data/state.json (state, audit log, activity feed)
```

## Data flow

1. **Intake → ICP.** `/api/intake` saves the description and criteria. `/api/icp` asks Claude via Converse for a strict JSON ICP: NAICS industries, size tiers, personas, triggers, negative signals and expansion segments, each with a confidence score. Segments are accepted or dismissed through `/api/icp/segment`, and every decision is audited.
2. **Discovery.** `/api/discover` builds up to 7 Tavily news queries from the ICP: industries, triggers, accepted expansion segments, and hiring for simulation/validation roles. It de-duplicates results and asks Claude to extract companies and claims. The server **drops any claim whose URL is not in the search results**, so there are no hallucinated sources. Companies with a negative signal are kept and shown, but marked excluded. A second Tavily search plus Claude call builds the competitor map.
3. **Evidence index.** Every claim, and every raw search result, is upserted into the Moss index `signal-evidence`. Each document has an `id`, `text`, and string metadata (`url`, `companyId`, `company`, `signalType`).
4. **Reviewer agent.** `/api/verify` fetches each source page, falling back to Tavily Extract when the page blocks bots. It retrieves related evidence from Moss and asks Claude whether the page *explicitly* supports the claim. A claim counts as verified only when `supported` is true and confidence ≥ 0.6. The supporting quote is stored.
5. **Graph.** `lib/graph.ts` builds nodes and relationships from app state and `data/team_history.json`.
   - Nodes: `Company`, `Person`, `Product`, `Competitor`, `Signal`.
   - Relationships: `WORKS_AT`, `COMPETES_WITH`, `MATCHED_TO`, `CONTACTED_VIA`, `REPLIED_TO`, `PREVIOUSLY_EMPLOYED_AT`, `HAS_SIGNAL`.
   - `/api/graph` syncs to Neo4j: every node also carries the `SignalGTM` label, so a resync only replaces this app's data. It then runs the warm-path query:
     ```cypher
     MATCH (t:SignalGTM:Person {team: true}), (c:SignalGTM:Company {id: $companyKey})
     MATCH p = shortestPath((t)-[:WORKS_AT|PREVIOUSLY_EMPLOYED_AT*..4]-(c))
     RETURN [n IN nodes(p) | n.name] AS path ORDER BY length(p) ASC LIMIT 1
     ```
6. **Scoring.** `lib/scoring.ts` computes the score as follows:
   - **Fit (40):** Claude's ICP fit × 40.
   - **Signal (40):** signals are weighted by type (funding > hiring = expansion > launch > partnership). Verified claims count fully and unverified ones at 30%, with diminishing returns per extra claim.
   - **Relationship (20):** based on warm-path length (≤2 hops = 20, ≤4 = 14).
   - **Tiers:** A ≥ 70, B ≥ 50, otherwise C.
   - **Why now:** the strongest verified signal, plus up to 3 citation URLs.
7. **Enrichment.** `/api/enrich` takes the top 5 non-excluded companies only. Before **each** Hunter call the server checks the credit balance; at zero it returns HTTP 402 *"Top up credits"*. It picks the best contact by persona title match and seniority, then verifies the email. Results are cached on disk (`data/cache/hunter-*.json`), and only uncached calls are metered.
8. **Outreach (HITL).** `/api/outreach/draft` retrieves company evidence from Moss and asks Claude for a persona-styled email and a follow-up. Template A is signal-led and template B is pain-led; they alternate. Facts are restricted to the retrieved evidence. `/api/outreach/action` is a state machine: `draft → approved → sent`, plus `rejected`/`reopen`, and an edit resets the draft to `draft`. **`send` returns 403 unless the draft is approved**, so the check holds even if the UI is bypassed. Send is simulated, written to the audit log, and metered as `outreach_sent`.
9. **Pipeline.** Stage changes are appended to `events` with actor `AI` (initial match), `Rep` (manual move or send) or `Simulated` (the demo-only *Simulate replies* button, with probabilities by tier and template). The UI computes conversion by stage and tier, and template A vs B.
10. **Billing.** `lib/flexprice.ts` sends `POST /events` with `event_name` ∈ {`leads_enriched`, `outreach_sent`, `graph_queries`} and `external_customer_id`. The balance comes from the customer's prepaid wallet, and the top-up button calls the wallet top-up endpoint. Metering never breaks the user flow: failures are logged, not thrown.

## Design choices

- **Every claim has a source:** the server drops claims whose URL is not in the search results, and a separate reviewer re-reads the source page.
- **Humans approve outbound:** approval is enforced on the server, not just in the UI. There is no real email sending in the MVP.
- **Missing integrations degrade gracefully:** `lib/env.ts` centralises key checks, and a typed `MissingKeyError` becomes a clear 400 response that names the missing variables. Secret values are never logged or returned.
- **Transparency:** every LLM call, retrieval (with latency and top scores), graph sync and billing event is written to the activity feed. The UI shows that feed as the *Agent thinking* panel.
- **Simple state:** a single JSON file (`data/state.json`) that is git-ignored and easy to reset or replay.
- **Cost control:** Hunter only runs for the top 5 leads, with a disk cache and a credit gate before each call.
