// Central place for integration configuration. Never log values from here.

export const INTEGRATIONS = {
  bedrock: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "BEDROCK_MODEL_ID"],
  tavily: ["TAVILY_API_KEY"],
  hunter: ["HUNTER_API_KEY"],
  neo4j: ["NEO4J_URI", "NEO4J_USERNAME", "NEO4J_PASSWORD"],
  flexprice: ["FLEXPRICE_API_KEY", "FLEXPRICE_BASE_URL"],
  moss: ["MOSS_PROJECT_ID", "MOSS_PROJECT_KEY"],
} as const;

export type Integration = keyof typeof INTEGRATIONS;

export function missingKeys(name: Integration): string[] {
  return INTEGRATIONS[name].filter((k) => !process.env[k] || process.env[k]!.trim() === "");
}

export function isConfigured(name: Integration): boolean {
  return missingKeys(name).length === 0;
}

export class MissingKeyError extends Error {
  integration: Integration;
  keys: string[];
  constructor(integration: Integration, keys: string[], message?: string) {
    super(message ?? `${integration} is not configured. Add ${keys.join(", ")} to .env.local and save the file.`);
    this.integration = integration;
    this.keys = keys;
  }
}

export function requireIntegration(name: Integration) {
  const m = missingKeys(name);
  if (m.length) throw new MissingKeyError(name, m);
}

export function integrationStatus() {
  return Object.fromEntries(
    (Object.keys(INTEGRATIONS) as Integration[]).map((k) => [k, { configured: isConfigured(k), missing: missingKeys(k) }]),
  ) as Record<Integration, { configured: boolean; missing: string[] }>;
}

/** An LLM is available if Bedrock is configured, or Moss (Moss Inference fallback). */
export function requireLLM() {
  if (isConfigured("bedrock") || isConfigured("moss")) return;
  throw new MissingKeyError(
    "bedrock",
    [...missingKeys("moss"), ...missingKeys("bedrock")],
    "No LLM configured. Add MOSS_PROJECT_ID and MOSS_PROJECT_KEY to .env.local (Moss Inference), or the AWS Bedrock keys, then save the file.",
  );
}
