"use client";
import { useCallback, useEffect, useState } from "react";
import type { AppState } from "@/lib/types";

export interface AppData {
  state: AppState;
  integrations: Record<string, { configured: boolean; missing: string[] }>;
  credits: { source: string; balance: number; ok: boolean; error?: string };
  evidenceBackend: "moss" | "local";
  llm: "bedrock" | "moss" | "none";
  band?: { configured: boolean; roles: Record<string, boolean>; missing: string[] };
}

export function useApp() {
  const [data, setData] = useState<AppData | null>(null);
  const refresh = useCallback(async () => {
    const r = await fetch("/api/state", { cache: "no-store" });
    setData(await r.json());
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { data, refresh };
}

/** POST helper returning {ok, data, error}. Friendly text for missing keys. */
export async function post<T = unknown>(url: string, body: unknown = {}): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) return { ok: false, error: j.missing ? `Missing key — ${j.error}` : j.error };
    return { ok: true, data: j };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export type StepProps = { data: AppData; refresh: () => Promise<void>; go: (tab: string) => void };
