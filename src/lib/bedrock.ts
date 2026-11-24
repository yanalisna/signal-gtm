import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { isConfigured, requireIntegration } from "./env";
import { logActivity } from "./store";

let client: BedrockRuntimeClient | null = null;
function getClient() {
  requireIntegration("bedrock");
  if (!client) client = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
  return client;
}

export function extractJSON<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  const endObj = candidate.lastIndexOf("}");
  const endArr = candidate.lastIndexOf("]");
  const end = Math.max(endObj, endArr);
  if (start < 0 || end < 0) throw new Error("Model did not return JSON");
  return JSON.parse(candidate.slice(start, end + 1)) as T;
}

const JSON_RULE = "\n\nRespond with a single valid JSON value only. No prose, no markdown fences.";
export const MOSS_FALLBACK_MODEL = "anthropic/claude-sonnet-5.5";

async function bedrockText(opts: { system: string; prompt: string; maxTokens: number; temperature: number }) {
  const res = await getClient().send(
    new ConverseCommand({
      modelId: process.env.BEDROCK_MODEL_ID,
      system: [{ text: opts.system + JSON_RULE }],
      messages: [{ role: "user", content: [{ text: opts.prompt }] }],
      inferenceConfig: { maxTokens: opts.maxTokens, temperature: opts.temperature },
    }),
  );
  return {
    text: (res.output?.message?.content ?? []).map((b) => ("text" in b ? b.text : "")).join(""),
    usage: `${res.usage?.inputTokens ?? "?"} in / ${res.usage?.outputTokens ?? "?"} out tokens`,
  };
}

/** Fallback LLM: Moss Inference (OpenAI-compatible chat completions). */
async function mossText(opts: { system: string; prompt: string; maxTokens: number; temperature: number }) {
  const res = await fetch("https://inference.moss.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.MOSS_PROJECT_ID}:${process.env.MOSS_PROJECT_KEY}`,
    },
    body: JSON.stringify({
      model: MOSS_FALLBACK_MODEL,
      messages: [
        { role: "system", content: opts.system + JSON_RULE },
        { role: "user", content: opts.prompt },
      ],
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
    }),
  });
  if (!res.ok) throw new Error(`Moss Inference failed (${res.status})`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await res.json();
  return {
    text: String(json.choices?.[0]?.message?.content ?? ""),
    usage: `${json.usage?.prompt_tokens ?? "?"} in / ${json.usage?.completion_tokens ?? "?"} out tokens`,
  };
}

export function llmBackend(): "bedrock" | "moss" | "none" {
  return isConfigured("bedrock") ? "bedrock" : isConfigured("moss") ? "moss" : "none";
}

/** Call Claude on Bedrock via the Converse API (Moss Inference as fallback) and parse a JSON response. */
export async function converseJSON<T>(opts: {
  step: string;
  system: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<T> {
  const args = { system: opts.system, prompt: opts.prompt, maxTokens: opts.maxTokens ?? 4000, temperature: opts.temperature ?? 0.2 };
  const t0 = Date.now();
  let out: { text: string; usage: string };
  let via = "Bedrock Converse";
  if (isConfigured("bedrock")) {
    try {
      out = await bedrockText(args);
    } catch (e) {
      if (!isConfigured("moss")) throw e;
      logActivity({ step: opts.step, message: `Bedrock failed (${(e as Error).message.slice(0, 100)}); falling back to Moss Inference`, level: "warn" });
      via = `Moss Inference (${MOSS_FALLBACK_MODEL})`;
      out = await mossText(args);
    }
  } else if (isConfigured("moss")) {
    via = `Moss Inference (${MOSS_FALLBACK_MODEL}, Bedrock keys missing)`;
    out = await mossText(args);
  } else {
    requireIntegration("bedrock"); // throws a clear MissingKeyError
    throw new Error("unreachable");
  }
  logActivity({ step: opts.step, message: `${via} call (${out.usage})`, latencyMs: Date.now() - t0 });
  try {
    return extractJSON<T>(out.text);
  } catch (e) {
    logActivity({ step: opts.step, message: "Could not parse model JSON", detail: out.text.slice(0, 500), level: "error" });
    throw e;
  }
}
