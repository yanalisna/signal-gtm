"use client";
import { Brain, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { Activity } from "@/lib/types";
import { cn } from "./ui";

export function ActivityFeed({ items }: { items: Activity[] }) {
  const [open, setOpen] = useState(true);
  return (
    <aside className={cn("shrink-0 border-l border-slate-200 bg-slate-950 text-slate-200 transition-all", open ? "w-96" : "w-11")}>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 border-b border-slate-800 px-3 py-3 text-sm font-semibold">
        <ChevronRight className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        {open && (
          <>
            <Brain className="h-4 w-4 text-violet-400" /> Agent thinking
          </>
        )}
      </button>
      {open && (
        <ul className="h-[calc(100vh-49px)] space-y-2 overflow-y-auto p-3 font-mono text-[11px] leading-snug">
          {[...items].reverse().map((a, i) => (
            <li key={i} className={cn("rounded px-2 py-1.5", a.level === "error" ? "bg-rose-950" : a.level === "warn" ? "bg-amber-950" : "bg-slate-900")}>
              <div className="flex justify-between text-slate-500">
                <span className="uppercase text-violet-400">{a.step}</span>
                <span>
                  {a.latencyMs != null && <span className="mr-2 text-emerald-400">{a.latencyMs} ms</span>}
                  {new Date(a.ts).toLocaleTimeString()}
                </span>
              </div>
              <div>{a.message}</div>
              {a.detail && <div className="mt-1 whitespace-pre-wrap break-all text-slate-500">{a.detail}</div>}
            </li>
          ))}
          {!items.length && <li className="text-slate-500">Agent activity will stream here.</li>}
        </ul>
      )}
    </aside>
  );
}
