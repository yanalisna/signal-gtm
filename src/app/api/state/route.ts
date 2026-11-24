import { integrationStatus } from "@/lib/env";
import { creditStatus } from "@/lib/flexprice";
import { evidenceBackend } from "@/lib/evidence";
import { load } from "@/lib/store";
import { llmBackend } from "@/lib/bedrock";
import { bandStatus } from "@/lib/band";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = load();
  const credits = await creditStatus();
  return Response.json({ state, integrations: integrationStatus(), credits, evidenceBackend: evidenceBackend(), llm: llmBackend(), band: bandStatus() });
}
