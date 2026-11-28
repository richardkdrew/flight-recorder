// AC19: when the proposal cites nothing or an id no printed cause cites, when its reply is not in the expected
// form or stopped at the output cap, or when no reply arrives within the timeout, `flight propose` still prints
// the retro but no `## Proposal`, asks no question, runs no command, says why on stderr, and exits 1.
// The 120-second default is in ac19-default-timeout.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";

import { HANG, answer, delayed, rawText, retroReply, type Reply } from "./fixtures/replies.ts";
import { DETAIL_EVENTS, ev } from "./fixtures/retro.ts";
import { CAUSE_A, GOOD, RETRO_REPLY, UNCITED, jsonReply, proposalReply } from "./fixtures/propose.ts";
import {
  assertNothingOffered,
  assertStartsWithRetro,
  propose,
  showP,
  stderrFrom,
  withRetro,
  type ProposeRun,
} from "./propose-support.ts";

async function proposeWith(second: Reply, limits?: Record<string, number>) {
  const { log, env, retroRun } = await withRetro(DETAIL_EVENTS, [], [RETRO_REPLY], limits);
  const run = await propose(["--log", log], { env, replies: [RETRO_REPLY, second], ...(limits ? { limits } : {}) });
  return { run, retroRun };
}

function assertWithheld(run: ProposeRun, retroRun: Parameters<typeof assertStartsWithRetro>[1]): void {
  assert.equal(run.code, 1, showP(run));
  assertStartsWithRetro(run, retroRun);
  assertNothingOffered(run);
  assert.equal(run.requests.length, 2, `the proposal's request should have been sent\n${showP(run)}`);
}

for (const [name, bad] of [
  ["an id only a went-well item cites", UNCITED.wentWellOnly],
  ["an id only a dropped cause cites", UNCITED.droppedOnly],
  ["an event of a delivery the retro did not cover", UNCITED.notSent],
  ["an id in no event and no delivery of the log", UNCITED.missing],
] as const) {
  test(`AC19 a proposal citing ${name} is withheld: 'proposal withheld: <ids>' names it, exit 1`, async () => {
    const { run, retroRun } = await proposeWith(proposalReply({ ...GOOD, cites: [ev("x", "s1"), bad] }));
    assertWithheld(run, retroRun);
    assert.ok(stderrFrom(run, "proposal withheld: ").includes(bad), `the withheld line should name ${bad}\n${showP(run)}`);
    assert.ok(!run.stdout.includes(GOOD.title), `the proposal's title was printed\n${showP(run)}`);
  });
}

test("AC19 a proposal citing two ids no printed cause cites names both, exit 1", async () => {
  const { run, retroRun } = await proposeWith(
    proposalReply({ ...GOOD, cites: [UNCITED.missing, ...CAUSE_A.cites, UNCITED.wentWellOnly] }),
  );
  assertWithheld(run, retroRun);
  const line = stderrFrom(run, "proposal withheld: ");
  for (const id of [UNCITED.missing, UNCITED.wentWellOnly]) assert.ok(line.includes(id), `the withheld line should name ${id}: ${line}`);
});

test("AC19 a proposal that cites nothing is withheld: 'proposal withheld: it cited nothing', exit 1", async () => {
  const { run, retroRun } = await proposeWith(proposalReply({ ...GOOD, cites: [] }));
  assertWithheld(run, retroRun);
  assert.equal(stderrFrom(run, "proposal withheld: "), "proposal withheld: it cited nothing", showP(run));
});

for (const [name, reply] of [
  ["text that is not JSON", rawText("AC19-PROSE: The factory should notify the owner.")],
  ["an ask-style answer", answer("AC19-ASK-FORM: notify the owner", [ev("x", "s1")])],
  ["a retro reply", retroReply([CAUSE_A], [])],
  ["a proposal with no change", jsonReply({ kind: "proposal", title: GOOD.title, problem: GOOD.problem, cites: GOOD.cites })],
  ["a proposal with an empty title", proposalReply({ ...GOOD, title: "" })],
  ["a proposal whose title is 121 characters", proposalReply({ ...GOOD, title: "T".repeat(121) })],
  ["a valid proposal stopped at the output cap (stop_reason max_tokens)", proposalReply(GOOD, "max_tokens")],
] as const) {
  test(`AC19 a proposal reply that is ${name} prints 'stopped: the model's reply was not in the expected form', exit 1`, async () => {
    const { run, retroRun } = await proposeWith(reply);
    assertWithheld(run, retroRun);
    assert.ok(
      run.stderr.includes("stopped: the model's reply was not in the expected form"),
      `stderr should say "stopped: the model's reply was not in the expected form"\n${showP(run)}`,
    );
    assert.ok(!run.stdout.includes("AC19-PROSE") && !run.stdout.includes("AC19-ASK-FORM"), showP(run));
  });
}

test("AC19 no proposal reply within the timeout prints 'stopped: no answer within <s> seconds' after the retro, exit 1", { timeout: 60_000 }, async () => {
  const { run, retroRun } = await proposeWith(HANG, { timeoutSeconds: 2 });
  assertWithheld(run, retroRun);
  assert.ok(run.stderr.includes("stopped: no answer within 2 seconds"), `stderr should say "stopped: no answer within 2 seconds"\n${showP(run)}`);
  assert.ok(run.seconds >= 1.8 && run.seconds < 30, `it stopped after ${run.seconds.toFixed(1)} seconds, not about 2`);
});

test("AC19 a valid proposal that would arrive after the timeout is not printed, exit 1", { timeout: 60_000 }, async () => {
  const { run, retroRun } = await proposeWith(delayed(6_000, proposalReply(GOOD)), { timeoutSeconds: 2 });
  assertWithheld(run, retroRun);
  assert.ok(run.stderr.includes("stopped: no answer within 2 seconds"), `stderr should say "stopped: no answer within 2 seconds"\n${showP(run)}`);
  assert.ok(run.seconds < 5.5, `it waited ${run.seconds.toFixed(1)} seconds, past its 2-second timeout`);
});
