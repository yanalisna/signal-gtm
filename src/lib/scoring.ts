import type { AppState, Score, SignalType } from "./types";

// Fit 40 / Signal 40 / Relationship 20
const SIGNAL_WEIGHT: Record<SignalType, number> = {
  funding: 1,
  hiring: 0.8,
  expansion: 0.8,
  product_launch: 0.6,
  partnership: 0.5,
  other: 0.3,
  negative: 0,
};

export function scoreCompany(s: AppState, companyId: string, warmPath: string[] | null): Score {
  const c = s.companies.find((x) => x.id === companyId)!;
  const claims = s.claims.filter((x) => x.companyId === companyId && x.signalType !== "negative");
  const fit = Math.round(40 * Math.max(0, Math.min(1, c.fit)));

  // verified claims count fully, unverified count at 30%; diminishing returns per extra claim
  const weighted = claims
    .map((cl) => SIGNAL_WEIGHT[cl.signalType] * (cl.status === "verified" ? 1 : 0.3))
    .sort((a, b) => b - a)
    .reduce((acc, w, i) => acc + w / (i + 1), 0);
  const signal = Math.round(Math.min(40, weighted * 22));

  let relationship = 0;
  if (warmPath) relationship = warmPath.length <= 2 ? 20 : warmPath.length <= 4 ? 14 : 8;

  const total = fit + signal + relationship;
  const tier = total >= 70 ? "A" : total >= 50 ? "B" : "C";
  const best =
    claims.filter((x) => x.status === "verified").sort((a, b) => SIGNAL_WEIGHT[b.signalType] - SIGNAL_WEIGHT[a.signalType])[0] ??
    claims[0];
  const whyNow = best
    ? `${best.signalType.replace("_", " ")}: ${best.text}${best.status === "verified" ? "" : " (unverified)"}`
    : "No timely signal found yet.";
  const citations = [...new Set(claims.filter((x) => x.status === "verified").map((x) => x.url))].slice(0, 3);
  return { companyId, fit, signal, relationship, total, tier, whyNow, citations, warmPath: warmPath ?? undefined };
}
