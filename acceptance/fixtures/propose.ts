// Logs and hand-written replies for the flight-propose acceptance tests (docs/specs/flight-propose.md).
// The retro's reply is AC12's, on the detail log, so the causes it prints are known: 4 causes, with one
// dropped cause and two went-well items whose ids no printed cause cites.

import { MISSING_ID, type Event } from "./events.ts";
import { MODEL, retroReply, type Reply, type RetroItem } from "./replies.ts";
import { DETAIL, DETAIL_EVENTS, byTime, delivery, ev, note } from "./retro.ts";

// Covered on the detail log: plain-change (y, beta-site), rich-change (x, alpha-shop), small-fix (w, alpha-shop).
export const CAUSE_A: RetroItem = {
  text: "AC12-CAUSE-A: escalations stopped the build and waited on the owner",
  cites: [ev("x", "s1"), ev("x", "s2"), note("f5")],
};
export const CAUSE_DROPPED: RetroItem = {
  text: "AC12-CAUSE-DROPPED: notes about small-fix only",
  cites: [note("f6"), note("f3"), ev("w", "a2")],
};
export const CAUSE_F: RetroItem = {
  text: "AC12-CAUSE-F: acceptance waited for the owner's morning",
  cites: [note("f1"), ev("w", "a2")],
};
export const CAUSE_B: RetroItem = {
  text: "AC12-CAUSE-B: every change needed more than one build",
  cites: [DETAIL.x.id, ev("w", "eng1"), ev("y", "s1")],
};
export const CAUSE_D: RetroItem = {
  text: "AC12-CAUSE-D: commands ended long before the owner answered",
  cites: [ev("x", "c2"), ev("w", "c1"), ev("w", "a1"), ev("w", "c2"), ev("w", "c2")],
};
export const WELL_1: RetroItem = {
  text: "AC12-WELL-1: the small changes were accepted on their first preview",
  cites: [ev("y", "a3"), ev("w", "a2")],
};
export const WELL_2: RetroItem = { text: "AC12-WELL-2: rich-change shipped despite its stops", cites: [DETAIL.x.id] };

/** AC12's reply: the retro prints causes B, D, A and F, in that order, and drops CAUSE_DROPPED. */
export const RETRO_REPLY: Reply = retroReply([CAUSE_A, CAUSE_DROPPED, CAUSE_F, CAUSE_B, CAUSE_D], [WELL_1, WELL_2]);

/** The causes AC12 prints, in order, with the counts the code works out. */
export const PRINTED_CAUSES: [RetroItem, string][] = [
  [CAUSE_B, "(3 changes, 2 events)"],
  [CAUSE_D, "(2 changes, 4 events)"],
  [CAUSE_A, "(2 changes, 3 events)"],
  [CAUSE_F, "(2 changes, 2 events)"],
];

/** A retro reply whose only cause spans 1 change, so `## Causes that repeat` is printed with no cause. */
export const NO_CAUSE_LEFT_REPLY: Reply = retroReply([CAUSE_DROPPED], [WELL_2]);

/** Ids that no printed cause cites: a went-well item's, a dropped cause's, one not sent, one in no event. */
export const UNCITED = {
  wentWellOnly: ev("y", "a3"),
  droppedOnly: note("f3"),
  notSent: ev("z", "rules"),
  missing: MISSING_ID,
} as const;

/** A project in the log whose every event is older than 2026-11-01, with a change accepted 2026-10-01. */
export const DELTA_PATH = "/Users/someone/Old/delta-tools";
const delta = delivery("delta", DELTA_PATH, "delta-cleanup");
export const DELTA = delta;

/** The detail log and the delta-tools delivery: 4 changes covered by default, 3 with --since 2026-11-01. */
export const SINCE = "2026-11-01";
export const PROPOSE_EVENTS: readonly Event[] = byTime([
  ...DETAIL_EVENTS,
  delta.command("build", "2026-10-01 10:00", "build", "succeeded"),
  delta.decided("accept", "2026-10-01 12:00", "accepted"),
]);

export type Proposal = {
  readonly title: string;
  readonly problem: string;
  readonly change: string;
  readonly cites: readonly string[];
};

/**
 * A proposal that passes every check: it cites only ids printed causes cite, and names no covered change,
 * no project in the log, no path and no email address. Its ids: rich-change's delivery id (cause B), a
 * small-fix event (cause B, cited twice) and a note printed under plain-change (cause A): 3 changes, 2 events.
 */
export const GOOD: Proposal = {
  title: "Tell the owner when a run stops for them",
  problem: "Rule stops and build stops waited for hours on the owner, who saw them only the next morning.",
  change: "Have orc send a desktop notification when a run stops for the owner, naming the stop.",
  cites: [DETAIL.x.id, ev("w", "eng1"), note("f5"), ev("w", "eng1")],
};
export const GOOD_COUNTS = "(3 changes, 2 events)";

let counter = 0;

function messageBody(text: string, stopReason: string): Record<string, unknown> {
  counter += 1;
  return {
    id: `msg_acceptance_propose_${String(counter)}`,
    type: "message",
    role: "assistant",
    model: MODEL,
    content: [{ type: "text", text }],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 500, output_tokens: 40, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  };
}

/** The proposal call's reply: `{"kind":"proposal",...}`, ended normally unless `stopReason` says otherwise. */
export function proposalReply(p: Proposal, stopReason = "end_turn"): Reply {
  const value = { kind: "proposal", title: p.title, problem: p.problem, change: p.change, cites: p.cites };
  return { kind: "body", body: messageBody(JSON.stringify(value), stopReason) };
}

/** A reply whose text is any JSON value. */
export function jsonReply(value: unknown): Reply {
  return { kind: "body", body: messageBody(JSON.stringify(value), "end_turn") };
}
