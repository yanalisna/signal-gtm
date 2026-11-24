import { requireIntegration } from "./env";
import { logActivity } from "./store";

export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score?: number;
  published_date?: string;
}

export async function tavilySearch(
  query: string,
  opts: { maxResults?: number; topic?: "general" | "news"; days?: number } = {},
): Promise<TavilyResult[]> {
  requireIntegration("tavily");
  const t0 = Date.now();
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.TAVILY_API_KEY}` },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      max_results: opts.maxResults ?? 8,
      topic: opts.topic ?? "general",
      ...(opts.days ? { days: opts.days } : {}),
      include_answer: false,
    }),
  });
  if (!res.ok) throw new Error(`Tavily search failed (${res.status})`);
  const json = (await res.json()) as { results: TavilyResult[] };
  logActivity({ step: "discovery", message: `Tavily: "${query}" → ${json.results.length} results`, latencyMs: Date.now() - t0 });
  return json.results;
}

/** Use Tavily Extract as fallback when a direct fetch of a source is blocked. */
export async function tavilyExtract(url: string): Promise<string | null> {
  requireIntegration("tavily");
  const res = await fetch("https://api.tavily.com/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.TAVILY_API_KEY}` },
    body: JSON.stringify({ urls: [url] }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { results?: { url: string; raw_content: string }[] };
  return json.results?.[0]?.raw_content ?? null;
}

export async function fetchPageText(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SignalGTM-Reviewer/0.1)" },
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(String(res.status));
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length > 300) return text;
  } catch {}
  try {
    return await tavilyExtract(url);
  } catch {
    return null;
  }
}
