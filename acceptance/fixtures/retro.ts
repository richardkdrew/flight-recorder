// Logs for the flight-retro acceptance tests, shaped like orc's and holding the values orc's real log holds
// (docs/ARCHITECTURE.md's table of event types). Projects are full folder paths, as in the live log.

import { createHash } from "node:crypto";

import { ALPHA_PATH, BETA_PATH, V2, type Event } from "./events.ts";

export { ALPHA_PATH, BETA_PATH };
export const GAMMA_PATH = "/Users/someone/Work/gamma-app";
/** Another folder whose last segment is also alpha-shop: a different raw project value. */
export const ALPHA_TWIN_PATH = "/Users/someone/Other/alpha-shop";

/** A 32-character hex id, the same for the same label. */
export function hex(label: string): string {
  return createHash("sha256").update(`flight-retro acceptance: ${label}`).digest("hex").slice(0, 32);
}

/** "2026-11-02 09:00" or "2026-11-02 09:00:59" as orc writes times, in UTC with +00:00. */
export function at(time: string): string {
  const [day, clock] = time.split(" ");
  const withSeconds = clock!.length === 5 ? `${clock}:00` : clock;
  return `${day}T${withSeconds}+00:00`;
}

const COMMIT = "c3".repeat(20);

/** Builds one delivery's events; every event's id comes from the delivery's label and its own. */
export function delivery(label: string, project: string, change: string) {
  const id = hex(`delivery ${label}`);
  const event = (name: string, time: string, type: string, data: Record<string, unknown>): Event => ({
    id: hex(`${label} ${name}`),
    time: at(time),
    type,
    project,
    change,
    delivery: id,
    source: V2,
    data,
  });
  return {
    id,
    project,
    change,
    agent: (name: string, time: string, agent: string, outcome: string): Event =>
      event(name, time, "orc.agent.finished.v1", {
        agent,
        harness: "claude",
        model: "claude-opus-5-5",
        models: ["claude-opus-5-5"],
        effort: "high",
        brief: "ab".repeat(8),
        seconds: 600,
        outcome,
        input_tokens: 1000,
        cached_tokens: 200,
        output_tokens: 300,
        cost_usd: 0.5,
      }),
    command: (name: string, time: string, command: string, outcome: string): Event =>
      event(name, time, "orc.command.finished.v1", { command, seconds: 900, outcome }),
    escalated: (name: string, time: string, kind: string, count: number): Event =>
      event(name, time, "orc.run.escalated.v1", { kind, count, commit: COMMIT }),
    decided: (name: string, time: string, decision: string): Event =>
      event(name, time, "orc.owner.decided.v1", {
        decision,
        questions: 0,
        despite_review: false,
        commit: COMMIT,
        reviewed_commit: COMMIT,
        version: "1",
      }),
    judged: (name: string, time: string, verdict: string): Event =>
      event(name, time, "orc.owner.judged.v1", { verdict, commit: COMMIT }),
    review: (name: string, time: string, kind: "spec" | "code", verdict: string): Event =>
      event(name, time, "orc.review.recorded.v1", {
        kind,
        commit: COMMIT,
        verdict,
        blocking: verdict === "pass" ? 0 : 1,
        should_fix: 1,
        observation: 0,
      }),
    checks: (name: string, time: string): Event =>
      event(name, time, "orc.checks.recorded.v1", { commit: COMMIT, where: "CI", passed: 20, failed: 0 }),
    deploy: (name: string, time: string): Event =>
      event(name, time, "orc.deploy.finished.v1", { environment: "preview", commit: COMMIT, outcome: "succeeded", seconds: 60 }),
  };
}

/** A friction note: no delivery, no change, and sometimes no project. */
export function friction(label: string, time: string, project: string | null, note: string): Event {
  return {
    id: hex(`note ${label}`),
    time: at(time),
    type: "orc.friction.noted.v1",
    project,
    change: null,
    delivery: null,
    source: V2,
    data: { note },
  };
}

export const byTime = (events: readonly Event[]): Event[] =>
  [...events].sort((a, b) => Date.parse(a.time) - Date.parse(b.time));

/** The event of `events` with the id built from `label` and `name`. */
export function idOf(events: readonly Event[], label: string, name: string): string {
  const id = hex(`${label} ${name}`);
  if (!events.some((e) => e.id === id)) throw new Error(`fixture: no event ${label} ${name}`);
  return id;
}

// ---------------------------------------------------------------------------------------------------------
// The range log (AC6, AC7, AC8, AC14): six accepted changes and four that were never accepted.
// By latest acceptance: first 10-01, second 10-05, third 10-08 23:59, fifth 10-09 00:00, reopened 10-25
// (first accepted 09-25, before all the others), sixth 10-30.

const first = delivery("first", ALPHA_PATH, "first-change");
const second = delivery("second", BETA_PATH, "second-change");
const third = delivery("third", ALPHA_PATH, "third-change");
const reopened = delivery("reopened", BETA_PATH, "reopened-change");
const fifth = delivery("fifth", ALPHA_PATH, "fifth-change");
const sixth = delivery("sixth", BETA_PATH, "sixth-change");
const merged = delivery("merged", ALPHA_PATH, "merged-change");
const sentBack = delivery("sent-back", BETA_PATH, "sent-back-change");
const works = delivery("works", ALPHA_PATH, "judged-works-change");
const problems = delivery("problems", BETA_PATH, "judged-problems-change");

export const RANGE = { first, second, third, reopened, fifth, sixth, merged, sentBack, works, problems };

export const RANGE_EVENTS: readonly Event[] = byTime([
  reopened.command("build1", "2026-09-25 10:00", "build", "succeeded"),
  reopened.decided("accept1", "2026-09-25 12:00", "accepted"),
  first.command("build", "2026-10-01 10:00", "build", "succeeded"),
  first.decided("accept", "2026-10-01 12:00", "accepted"),
  second.command("build", "2026-10-05 10:00", "build", "succeeded"),
  second.decided("accept", "2026-10-05 12:00", "accepted"),
  third.command("build", "2026-10-08 21:00", "build", "succeeded"),
  third.decided("accept", "2026-10-08 23:59", "accepted"),
  fifth.command("build", "2026-10-08 22:00", "build", "succeeded"),
  fifth.decided("accept", "2026-10-09 00:00:00", "accepted"),
  reopened.decided("reopen", "2026-10-20 09:00", "reopened"),
  reopened.agent("eng", "2026-10-25 09:00", "engineering", "succeeded"),
  reopened.command("build2", "2026-10-25 10:00", "build", "succeeded"),
  reopened.decided("accept2", "2026-10-25 12:00", "accepted"),
  sixth.command("build", "2026-10-30 10:00", "build", "succeeded"),
  sixth.decided("accept", "2026-10-30 12:00", "accepted"),
  merged.command("build", "2026-10-31 10:00", "build", "succeeded"),
  merged.decided("merge", "2026-10-31 11:00", "merged"),
  merged.judged("judge", "2026-11-01 09:00", "works"),
  sentBack.command("build", "2026-11-01 10:00", "build", "succeeded"),
  sentBack.decided("send-back", "2026-11-02 09:00", "sent back"),
  works.command("build", "2026-11-03 10:00", "build", "succeeded"),
  works.judged("judge", "2026-11-03 12:00", "works"),
  problems.command("build", "2026-11-04 10:00", "build", "succeeded"),
  problems.judged("judge", "2026-11-04 12:00", "problems"),
  friction("range-1", "2026-10-26 08:00", BETA_PATH, "the reopened change waited a day for its second build"),
]);

/** The heading of a change's section: its change and its project's last path segment. */
export const heading = (d: { change: string; project: string }): string =>
  `${d.change} (${d.project.slice(d.project.lastIndexOf("/") + 1)})`;

/** The range log's events, keeping only those of `deliveries` (and no friction notes). */
export function onlyDeliveries(...deliveries: { id: string }[]): Event[] {
  const ids = new Set(deliveries.map((d) => d.id));
  return RANGE_EVENTS.filter((e) => e.delivery !== null && ids.has(e.delivery));
}

/** A log of `count` changes, one accepted each day from 2026-10-01: change-01, change-02, ... */
export function manyAccepted(count: number): { events: Event[]; headings: string[] } {
  const events: Event[] = [];
  const headings: string[] = [];
  for (let i = 1; i <= count; i++) {
    const n = String(i).padStart(2, "0");
    const d = delivery(`many-${n}`, i % 2 === 0 ? BETA_PATH : ALPHA_PATH, `change-${n}`);
    events.push(d.command("build", `2026-10-${n} 10:00`, "build", "succeeded"));
    events.push(d.decided("accept", `2026-10-${n} 12:00`, "accepted"));
    headings.push(heading(d));
  }
  return { events: byTime(events), headings };
}

// ---------------------------------------------------------------------------------------------------------
// The detail log (AC9 to AC13): three accepted changes, plain-change (accepted 11-04 10:31), rich-change
// (11-04 14:31) and small-fix (11-06 12:00), an earlier delivery of rich-change that was never accepted,
// a change still in progress, and friction notes placed to test which change each belongs to.

const z = delivery("z", ALPHA_PATH, "rich-change");
const x = delivery("x", ALPHA_PATH, "rich-change");
const w = delivery("w", ALPHA_PATH, "small-fix");
const y = delivery("y", BETA_PATH, "plain-change");
const pending = delivery("pending", ALPHA_PATH, "pending-change");

export const DETAIL = { x, y, w, z, pending };

/** The text of each friction note in the detail log, by its label. */
export const NOTES = {
  f0: "F0 note: before the range, about alpha-shop",
  f9: "F9 note: the build attempts ran out in the evening",
  f8: "F8 note: beta-site had nothing running yet",
  f4: "F4 note: written at the same second small-fix's design ended",
  f3: "F3 note: small-fix's spec was approved quickly",
  fx: "FX note: allowing past review felt rushed",
  f1: "F1 note: rich-change waited a whole day for acceptance",
  f2: "F2 note: small-fix's preview was easy to try",
  f5: "F5 note: the frozen tests needed correcting on plain-change",
  f6: "F6 note: no project on this one",
  f7: "F7 note: gamma-app has no change in this retro",
  ft: "FT note: a different folder that is also called alpha-shop",
  multi: "FM note: the review waited\non me overnight",
  end: "FE note: written after every covered change had ended",
} as const;

export type NoteLabel = keyof typeof NOTES;

export const DETAIL_EVENTS: readonly Event[] = byTime([
  // The earlier, never accepted, delivery of the same change in the same project.
  z.agent("eng", "2026-10-30 10:00", "engineering", "timed out"),
  z.escalated("rules", "2026-10-30 10:01", "rules", 1),
  z.command("build", "2026-10-30 10:02", "build", "stopped"),
  z.decided("send-back", "2026-10-30 11:00", "sent back"),
  friction("f0", "2026-11-01 12:00", ALPHA_PATH, NOTES.f0),

  // rich-change.
  x.agent("design", "2026-11-02 09:00", "design", "succeeded"),
  x.review("spec1", "2026-11-02 09:05", "spec", "changes_requested"),
  x.review("spec2", "2026-11-02 09:10", "spec", "pass"),
  x.command("c1", "2026-11-02 09:12", "design", "succeeded"),
  x.decided("a1", "2026-11-02 10:00", "approved"),
  x.agent("test1", "2026-11-02 10:20", "test", "timed out"),
  x.agent("test2", "2026-11-02 10:40", "test", "succeeded"),
  x.agent("eng1", "2026-11-02 11:00", "engineering", "succeeded"),
  x.escalated("rules1", "2026-11-02 11:05", "rules", 1),
  x.checks("checks1", "2026-11-02 11:10"),
  x.review("code1", "2026-11-02 11:30", "code", "changes_requested"),
  x.agent("eng2", "2026-11-02 12:00", "engineering", "failed"),
  x.agent("eng3", "2026-11-02 12:30", "engineering", "timed out"),
  x.escalated("s1", "2026-11-02 12:31", "build attempts", 3),
  x.command("c2", "2026-11-02 12:32", "build", "stopped"),
  x.decided("a2", "2026-11-03 09:47", "sent back"),
  x.agent("eng4", "2026-11-03 10:30", "engineering", "succeeded"),
  x.review("code2", "2026-11-03 11:00", "code", "pass"),
  x.escalated("s2", "2026-11-03 11:01", "rules", 1),
  x.command("c3", "2026-11-03 11:02", "build", "stopped"),
  x.decided("a3", "2026-11-03 11:09", "allowed past review"),
  x.command("c4", "2026-11-03 11:30", "build", "succeeded"),
  x.deploy("deploy", "2026-11-03 11:40"),
  x.decided("a4", "2026-11-04 14:31", "accepted"),
  x.decided("a5", "2026-11-04 15:00", "released"),

  // small-fix.
  w.command("c1", "2026-11-03 08:00:00", "design", "succeeded"),
  w.decided("a1", "2026-11-03 08:30", "approved"),
  w.agent("eng1", "2026-11-06 09:00", "engineering", "succeeded"),
  w.review("code1", "2026-11-06 10:00", "code", "pass"),
  w.command("c2", "2026-11-06 10:00:00", "build", "succeeded"),
  w.decided("a2", "2026-11-06 12:00:00", "accepted"),

  // plain-change.
  y.agent("design", "2026-11-03 13:00", "design", "succeeded"),
  y.command("c1", "2026-11-03 13:10:00", "design", "succeeded"),
  y.decided("a1", "2026-11-03 13:15:59", "approved"),
  y.agent("eng1", "2026-11-03 14:00", "engineering", "succeeded"),
  y.escalated("s1", "2026-11-03 14:05", "frozen tests", 1),
  y.command("c2", "2026-11-03 14:06", "build", "stopped"),
  y.decided("a2", "2026-11-03 14:50", "corrected tests"),
  y.agent("eng2", "2026-11-03 15:00", "engineering", "succeeded"),
  y.review("code1", "2026-11-03 15:20", "code", "pass"),
  y.command("c3", "2026-11-03 15:30", "build", "succeeded"),
  y.decided("merge", "2026-11-03 15:45", "merged"),
  y.judged("judge", "2026-11-04 09:30", "problems"),
  y.decided("a3", "2026-11-04 10:31", "accepted"),

  // A change still in progress, after every covered change.
  pending.agent("design", "2026-11-07 08:00", "design", "succeeded"),

  // Friction notes.
  friction("f9", "2026-11-02 20:00", ALPHA_PATH, NOTES.f9),
  friction("f8", "2026-11-02 15:00", BETA_PATH, NOTES.f8),
  friction("f4", "2026-11-03 08:00:00", ALPHA_PATH, NOTES.f4),
  friction("f3", "2026-11-03 08:45", ALPHA_PATH, NOTES.f3),
  friction("fx", "2026-11-03 11:20", ALPHA_PATH, NOTES.fx),
  friction("f1", "2026-11-04 16:00", ALPHA_PATH, NOTES.f1),
  friction("f5", "2026-11-04 11:00", BETA_PATH, NOTES.f5),
  friction("f6", "2026-11-04 12:00", null, NOTES.f6),
  friction("f7", "2026-11-04 12:30", GAMMA_PATH, NOTES.f7),
  friction("ft", "2026-11-04 17:00", ALPHA_TWIN_PATH, NOTES.ft),
  friction("multi", "2026-11-05 09:00", ALPHA_PATH, NOTES.multi),
  friction("f2", "2026-11-06 13:00", ALPHA_PATH, NOTES.f2),
  friction("end", "2026-11-07 09:00", ALPHA_PATH, NOTES.end),
]);

/** The id of a detail-log event: `ev("x", "a1")`. */
export const ev = (label: string, name: string): string => idOf(DETAIL_EVENTS, label, name);
/** The id of a detail-log friction note: `note("f1")`. */
export const note = (label: NoteLabel): string => idOf(DETAIL_EVENTS, "note", label);

/** The detail log's change sections, in the order they are printed: oldest acceptance first. */
export const DETAIL_HEADINGS = [heading(y), heading(x), heading(w)];
