// A small event log, shaped like orc's, that the acceptance tests write into their own SQLite files.
// Projects are full folder paths, as in the factory's live log.

export type Event = {
  id: string;
  time: string;
  type: string;
  project: string | null;
  change: string | null;
  delivery: string | null;
  source: string;
  data: Record<string, unknown>;
};

const hex32 = (prefix: string): string => prefix.padEnd(32, "0");

export const V1 = "orc@" + "1".repeat(40);
export const V2 = "orc@" + "2".repeat(40);

export const ALPHA_PATH = "/Users/someone/Work/alpha-shop";
export const BETA_PATH = "/Users/someone/Clients/beta-site";
export const PRIVATE_PARENTS = ["/Users/someone/Work", "/Users/someone/Clients", "/Users/someone"];

export const D1 = hex32("d1");
export const D2 = hex32("d2");
export const D3 = hex32("d3");

export const E1 = hex32("e1");
export const E2 = hex32("e2");
export const E3 = hex32("e3");
export const E4 = hex32("e4");
export const E5 = hex32("e5");
export const E6 = hex32("e6");
export const E7 = hex32("e7");
export const E8 = hex32("e8");
export const E9 = hex32("e9");

/** An id in no event and no delivery of the log. */
export const MISSING_ID = "f".repeat(32);

export const COMMIT1 = "c1".repeat(20);
/** A commit that read_delivery returns for D2, inside events' data: neither an event id nor a delivery id. */
export const COMMIT2 = "c2".repeat(20);

const agent = (seconds: number) => ({
  agent: "engineering",
  harness: "claude",
  model: "claude-opus-5-5",
  models: ["claude-opus-5-5"],
  effort: "high",
  brief: "ab".repeat(8),
  seconds,
  outcome: "ok",
  input_tokens: 1200,
  cached_tokens: 300,
  output_tokens: 450,
  cost_usd: 0.21,
});

export const EVENTS: readonly Event[] = [
  // D1: alpha-shop, the older factory version.
  { id: E1, time: "2026-10-01T09:00:00Z", type: "orc.agent.finished.v1", project: ALPHA_PATH, change: "add-cart", delivery: D1, source: V1, data: agent(300) },
  { id: E2, time: "2026-10-01T09:30:00Z", type: "orc.checks.recorded.v1", project: ALPHA_PATH, change: "add-cart", delivery: D1, source: V1, data: { commit: COMMIT1, where: "CI", passed: 12, failed: 0 } },
  { id: E3, time: "2026-10-01T10:00:00Z", type: "orc.owner.judged.v1", project: ALPHA_PATH, change: "add-cart", delivery: D1, source: V1, data: { verdict: "accepted", commit: COMMIT1 } },
  // D2: alpha-shop, the newer factory version.
  { id: E4, time: "2026-11-02T09:00:00Z", type: "orc.agent.finished.v1", project: ALPHA_PATH, change: "fix-totals", delivery: D2, source: V2, data: agent(420) },
  { id: E5, time: "2026-11-02T09:40:00Z", type: "orc.review.recorded.v1", project: ALPHA_PATH, change: "fix-totals", delivery: D2, source: V2, data: { kind: "code", commit: COMMIT2, verdict: "changes", blocking: 1, should_fix: 2, observation: 0 } },
  { id: E6, time: "2026-11-02T11:00:00Z", type: "orc.owner.decided.v1", project: ALPHA_PATH, change: "fix-totals", delivery: D2, source: V2, data: { decision: "accept", questions: 0, despite_review: false, commit: COMMIT2, reviewed_commit: COMMIT2, version: "1" } },
  // D3: beta-site, the newer factory version.
  { id: E7, time: "2026-11-05T14:00:00Z", type: "orc.command.finished.v1", project: BETA_PATH, change: "landing-page", delivery: D3, source: V2, data: { command: "build", seconds: 900, outcome: "ok" } },
  { id: E8, time: "2026-11-05T15:00:00Z", type: "orc.deploy.finished.v1", project: BETA_PATH, change: "landing-page", delivery: D3, source: V2, data: { environment: "preview", commit: COMMIT1, outcome: "ok", seconds: 40 } },
  // A friction note with no delivery.
  { id: E9, time: "2026-11-06T08:00:00Z", type: "orc.friction.noted.v1", project: ALPHA_PATH, change: null, delivery: null, source: V2, data: { note: "the review waited on me overnight" } },
];
