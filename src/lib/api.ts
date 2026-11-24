/* eslint-disable @typescript-eslint/no-explicit-any */
import { MissingKeyError } from "./env";
import { logActivity } from "./store";

export function route(step: string, fn: (body: any) => Promise<unknown>) {
  return async (req: Request) => {
    let body: any = {};
    try {
      if (req.method !== "GET") body = await req.json().catch(() => ({}));
      const result = await fn(body);
      return Response.json(result ?? { ok: true });
    } catch (e) {
      if (e instanceof MissingKeyError) {
        logActivity({ step, message: e.message, level: "warn" });
        return Response.json({ error: e.message, missing: e.keys, integration: e.integration }, { status: 400 });
      }
      const status = (e as { status?: number }).status ?? 500;
      const message = (e as Error).message || "Unknown error";
      logActivity({ step, message: `Error: ${message}`, level: "error" });
      return Response.json({ error: message }, { status });
    }
  };
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Run async tasks with limited concurrency. */
export async function pool<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    }),
  );
  return out;
}
