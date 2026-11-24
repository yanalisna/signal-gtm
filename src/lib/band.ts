// Band (app.band.ai) Agent API client: four remote agents (Planner, Builder, Reviewer, Security)
// post their steps into one Band room and hand off via @mentions. The human approves outreach
// by @mentioning Security in the room (free tier: Human API is Enterprise-only).
// Never logs API keys.
import { load, logActivity, update } from "./store";
import type { BandLogEntry } from "./types";
export type { BandLogEntry };

export const ROLES = ["planner", "builder", "reviewer", "security"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_NAME: Record<Role, string> = { planner: "Planner", builder: "Builder", reviewer: "Reviewer", security: "Security" };

const BASE = () => (process.env.BAND_API_BASE || "https://app.band.ai/api/v1/agent").replace(/\/$/, "");
const envKey = (r: Role, k: "AGENT_ID" | "API_KEY") => process.env[`BAND_${r.toUpperCase()}_${k}`]?.trim() || "";

export function bandStatus() {
  const roles = Object.fromEntries(ROLES.map((r) => [r, !!(envKey(r, "AGENT_ID") && envKey(r, "API_KEY"))])) as Record<Role, boolean>;
  const missing = ROLES.flatMap((r) => [`BAND_${r.toUpperCase()}_AGENT_ID`, `BAND_${r.toUpperCase()}_API_KEY`]).filter((k) => !process.env[k]?.trim());
  return { configured: ROLES.every((r) => roles[r]), roles, missing };
}

export class BandError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function call<T>(role: Role, path: string, init: RequestInit = {}): Promise<T> {
  const key = envKey(role, "API_KEY");
  if (!key) throw new BandError(400, `Band ${ROLE_NAME[role]} agent is not configured (BAND_${role.toUpperCase()}_API_KEY missing).`);
  const res = await fetch(BASE() + path, {
    ...init,
    headers: { "X-API-Key": key, "Content-Type": "application/json", Accept: "application/json", ...(init.headers || {}) },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {}
  if (!res.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const j = json as any;
    const msg = j?.error?.message || j?.message || j?.errors?.[0]?.detail || text.slice(0, 160);
    throw new BandError(res.status, `Band ${ROLE_NAME[role]} ${init.method ?? "GET"} ${path.split("?")[0]} → ${res.status}: ${msg}`);
  }
  return json as T;
}

export interface Participant {
  id: string;
  type: "User" | "Agent";
  handle?: string | null;
  name: string;
}

interface Room {
  chatId: string;
  title?: string | null;
  participants: Participant[];
  human?: Participant;
}

let roomCache: Room | null = null;

/** Resolve the Band room: BAND_ROOM_ID, else the Planner's most recent room. */
export async function getRoom(force = false): Promise<Room> {
  if (roomCache && !force) return roomCache;
  let chatId = process.env.BAND_ROOM_ID?.trim() || "";
  let title: string | null | undefined;
  if (!chatId) {
    const list = await call<{ data: { id: string; title?: string | null }[] }>("planner", "/chats?page=1&page_size=20");
    if (!list.data?.length)
      throw new BandError(
        404,
        "The Planner agent is not in any Band room yet. In app.band.ai create a room and add the Planner, Builder, Reviewer and Security agents.",
      );
    chatId = list.data[0].id;
    title = list.data[0].title;
  }
  const parts = await call<{ data: Participant[] }>("planner", `/chats/${chatId}/participants`);
  const participants = parts.data ?? [];
  roomCache = { chatId, title, participants, human: participants.find((p) => p.type === "User") };
  return roomCache;
}

function participantFor(room: Room, role: Role) {
  const id = envKey(role, "AGENT_ID");
  return room.participants.find((p) => p.id === id);
}

export function mirror(e: Omit<BandLogEntry, "ts">) {
  update((s) => {
    s.bandLog = [...(s.bandLog ?? []), { ts: new Date().toISOString(), ...e }].slice(-200);
  });
}

/** Post a message from `role` mentioning other agents and/or the human. */
export async function say(role: Role, content: string, mention: (Role | "human")[]) {
  const room = await getRoom();
  const mentions: { id: string; handle?: string; name: string }[] = [];
  const missing: string[] = [];
  for (const m of mention) {
    const p = m === "human" ? room.human : participantFor(room, m);
    if (!p) {
      missing.push(m === "human" ? "a human" : ROLE_NAME[m]);
      continue;
    }
    mentions.push({ id: p.id, ...(p.handle ? { handle: p.handle } : {}), name: p.name });
  }
  if (!mentions.length) throw new BandError(422, `Band: cannot @mention ${missing.join(", ")} (not in room "${room.title ?? room.chatId}").`);
  const prefix = mentions.map((m) => (m.handle ? `@${m.handle}` : `@${m.name}`)).join(" ");
  await call(role, `/chats/${room.chatId}/messages`, {
    method: "POST",
    body: JSON.stringify({ message: { content: `${prefix} ${content}`, mentions } }),
  });
  mirror({ from: ROLE_NAME[role], kind: "message", content, to: mentions.map((m) => m.name) });
}

/** Post a step (thought / task) event: shown in Band's agent stream, no mention needed. */
export async function step(role: Role, content: string, type: "thought" | "task" = "thought") {
  const room = await getRoom();
  await call(role, `/chats/${room.chatId}/events`, {
    method: "POST",
    body: JSON.stringify({ event: { content, message_type: type } }),
  });
  mirror({ from: ROLE_NAME[role], kind: type, content });
}

export interface BandMessage {
  id: string;
  content: string;
  sender_id: string;
  sender_type: "User" | "Agent";
  sender_name: string;
  inserted_at: string;
  message_type?: string;
}

/** Messages that @mention the Security agent (plus its own), oldest first. */
export async function securityInbox(): Promise<BandMessage[]> {
  const room = await getRoom();
  const out: BandMessage[] = [];
  let cursor = "";
  for (let i = 0; i < 5; i++) {
    const r = await call<{ data: BandMessage[]; metadata?: { has_more?: boolean; next_cursor?: string } }>(
      "security",
      `/chats/${room.chatId}/context?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    out.push(...(r.data ?? []));
    if (!r.metadata?.has_more || !r.metadata.next_cursor) break;
    cursor = r.metadata.next_cursor;
  }
  return out;
}

export function bandLogActivity(message: string, level?: "warn" | "error") {
  logActivity({ step: "band", message, ...(level ? { level } : {}) });
}

export function bandState() {
  return load().bandLog ?? [];
}
