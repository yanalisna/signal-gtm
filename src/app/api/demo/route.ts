import fs from "node:fs";
import path from "node:path";
import { route, HttpError } from "@/lib/api";
import { load, logActivity, save } from "@/lib/store";

// Demo mode: snapshot a successful live run and replay it later (e.g. if Wi-Fi or an API fails on stage).
const DATA = path.join(process.cwd(), "data");
const DEMO = path.join(DATA, "demo");
const CACHE_FILES = ["evidence.json", "hunter-domain.json", "hunter-verify.json"];

export async function GET() {
  const f = path.join(DEMO, "state.json");
  if (!fs.existsSync(f)) return Response.json({ saved: false });
  const st = JSON.parse(fs.readFileSync(f, "utf8"));
  return Response.json({ saved: true, savedAt: st.demoSavedAt ?? null, companies: st.companies?.length ?? 0 });
}

export const POST = route("demo", async (body) => {
  if (body.action === "save") {
    const s = load();
    if (!s.companies.length) throw new HttpError(400, "Nothing to save yet. Do a live run first.");
    fs.mkdirSync(DEMO, { recursive: true });
    fs.writeFileSync(path.join(DEMO, "state.json"), JSON.stringify({ ...s, demoSavedAt: new Date().toISOString() }, null, 2));
    for (const f of CACHE_FILES) {
      const src = path.join(DATA, "cache", f);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(DEMO, f));
    }
    logActivity({ step: "demo", message: `Saved this run as the demo snapshot (${s.companies.length} companies)` });
    return { ok: true };
  }
  if (body.action === "load") {
    const f = path.join(DEMO, "state.json");
    if (!fs.existsSync(f)) throw new HttpError(404, "No saved demo run yet.");
    const st = JSON.parse(fs.readFileSync(f, "utf8"));
    fs.mkdirSync(path.join(DATA, "cache"), { recursive: true });
    for (const c of CACHE_FILES) {
      const src = path.join(DEMO, c);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(DATA, "cache", c));
    }
    st.activity = [
      ...(st.activity ?? []),
      { ts: new Date().toISOString(), step: "demo", message: `DEMO MODE: replayed saved live run from ${st.demoSavedAt ?? "earlier"} (no live API calls)`, level: "warn" },
    ];
    save(st);
    return { ok: true };
  }
  throw new HttpError(400, "Unknown action");
});
