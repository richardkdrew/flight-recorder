// AC21: when the retro prints no cause (fewer than 2 changes covered, the reply says there is not enough data, no
// cause is left after the checks, or any failure of AC13), `flight propose` sends no second request, asks no
// question and runs no command; it prints what `flight retro` prints, adds `not enough data yet: a proposal needs
// at least one cause that repeats` when `## Causes that repeat` was printed with no cause, and exits as
// `flight retro` would. When the proposal's reply says the causes cannot support a proposal, it prints
// `not enough data yet: ` and what the reply says it would need, asks no question, runs no command, exits 0.

import { test } from "node:test";
import assert from "node:assert/strict";

import { MISSING_ID, type Event } from "./fixtures/events.ts";
import { HANG, notEnoughData, rawText, retroReply, type Reply } from "./fixtures/replies.ts";
import { DETAIL_EVENTS, RANGE, ev, onlyDeliveries } from "./fixtures/retro.ts";
import { NO_CAUSE_LEFT_REPLY, RETRO_REPLY, proposalReply, GOOD } from "./fixtures/propose.ts";
import { CAUSES, sections } from "./retro-support.ts";
import { lines } from "./support.ts";
import { assertNothingOffered, assertStartsWithRetro, propose, showP, withRetro } from "./propose-support.ts";

const NO_CAUSE_LINE = "not enough data yet: a proposal needs at least one cause that repeats";

async function both(events: readonly Event[], args: string[], retroReplies: Reply[], limits?: Record<string, number>) {
  const { log, env, retroRun } = await withRetro(events, args, retroReplies, limits);
  const run = await propose([...args, "--log", log], {
    env,
    // A proposal reply is queued after the retro's, so a second request would get an answer.
    replies: [...retroReplies, proposalReply(GOOD)],
    ...(limits ? { limits } : {}),
  });
  return { run, retroRun };
}

const CASES: [string, readonly Event[], string[], Reply[], Record<string, number> | undefined][] = [
  ["1 change is covered", onlyDeliveries(RANGE.first, RANGE.merged, RANGE.sentBack), [], [notEnoughData("never asked")], undefined],
  ["no change is covered", onlyDeliveries(RANGE.merged, RANGE.sentBack, RANGE.works), [], [notEnoughData("never asked")], undefined],
  ["--since covers 1 change", onlyDeliveries(RANGE.first, RANGE.second, RANGE.sixth), ["--since", "2026-10-29"], [notEnoughData("never asked")], undefined],
  ["the retro's reply says there is not enough data", DETAIL_EVENTS, [], [notEnoughData("AC21: at least 5 accepted changes from one factory version")], undefined],
  [
    "the retro's causes are withheld (AC13)",
    DETAIL_EVENTS,
    [],
    [retroReply([{ text: "AC21-BAD-CAUSE: rests on an id that was not sent", cites: [ev("x", "s1"), ev("w", "a2"), MISSING_ID] }], [])],
    undefined,
  ],
  ["the retro's reply is not in the expected form (AC13)", DETAIL_EVENTS, [], [rawText("AC21-PROSE: escalations repeat.")], undefined],
  ["the retro's request gets no reply within the timeout (AC13)", DETAIL_EVENTS, [], [HANG], { timeoutSeconds: 2 }],
];

for (const [name, events, args, replies, limits] of CASES) {
  test(`AC21 when ${name}, flight propose prints what flight retro prints, sends no second request and exits as it does`, { timeout: 60_000 }, async () => {
    const { run, retroRun } = await both(events, args, replies, limits);
    assert.equal(run.stdout, retroRun.stdout, `stdout should be exactly what flight retro prints\n--- flight retro ---\n${retroRun.stdout}\n--- flight propose ---\n${showP(run)}`);
    assert.equal(run.code, retroRun.code, `flight propose should exit as flight retro does (${String(retroRun.code)})\n${showP(run)}`);
    assert.equal(run.requests.length, retroRun.requests.length, `flight propose should send no request but the retro's\n${showP(run)}`);
    assertNothingOffered(run);
  });
}

test("AC21 when '## Causes that repeat' is printed with no cause, flight propose adds 'not enough data yet: a proposal needs at least one cause that repeats'", async () => {
  const { run, retroRun } = await both(DETAIL_EVENTS, [], [NO_CAUSE_LEFT_REPLY]);
  assert.ok(sections(retroRun.stdout).some((s) => s.heading === CAUSES), `flight retro should print "## ${CAUSES}"\n${retroRun.stdout}`);
  assertStartsWithRetro(run, retroRun);
  assert.ok(lines(run.stdout.slice(retroRun.stdout.length)).includes(NO_CAUSE_LINE), `no line "${NO_CAUSE_LINE}" after the retro\n${showP(run)}`);
  assert.equal(run.code, retroRun.code, `flight propose should exit as flight retro does (${String(retroRun.code)})\n${showP(run)}`);
  assert.equal(run.requests.length, 1, `flight propose should send no second request\n${showP(run)}`);
  assertNothingOffered(run);
});

test("AC21 a proposal reply that the causes cannot support one prints 'not enough data yet: ' and what it needs, asks nothing, exit 0", async () => {
  const needs = "AC21: a cause seen in at least 3 changes of the same factory version";
  const { log, env, retroRun } = await withRetro(DETAIL_EVENTS, [], [RETRO_REPLY]);
  const run = await propose(["--log", log], { env, replies: [RETRO_REPLY, notEnoughData(needs)] });
  assert.equal(run.code, 0, showP(run));
  assert.equal(run.requests.length, 2, showP(run));
  assertStartsWithRetro(run, retroRun);
  assert.ok(lines(run.stdout.slice(retroRun.stdout.length)).includes(`not enough data yet: ${needs}`), `no line "not enough data yet: ${needs}" after the retro\n${showP(run)}`);
  assertNothingOffered(run);
});
