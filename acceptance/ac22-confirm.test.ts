// AC22: after printing a proposal at a terminal, `flight propose` writes
// `Open this proposal as an issue on richardkdrew/agentic-orc-factory? [y/N] ` to stderr and reads one answer;
// only `y` or `yes`, in any case and with spaces around it ignored, opens the issue. On any other answer it runs
// no command, writes `not opened` to stderr and exits 0; with no terminal it asks nothing, runs no command,
// writes `not opened: confirm at a terminal to open it as an issue` to stderr and exits 0.

import { test } from "node:test";
import assert from "node:assert/strict";

import { DETAIL_EVENTS } from "./fixtures/retro.ts";
import { GOOD, RETRO_REPLY, proposalReply } from "./fixtures/propose.ts";
import { retroSetup } from "./retro-support.ts";
import {
  NOT_OPENED,
  NO_TERMINAL,
  QUESTION,
  hasProposal,
  propose,
  showP,
  stderrLines,
  type ProposeOptions,
} from "./propose-support.ts";

async function proposeAnswering(answer: ProposeOptions["answer"]) {
  const { log, env } = retroSetup(DETAIL_EVENTS);
  return propose(["--log", log], { env, replies: [RETRO_REPLY, proposalReply(GOOD)], answer });
}

test("AC22 after printing the proposal, flight propose writes the question to stderr and reads one answer", async () => {
  const run = await proposeAnswering("n");
  assert.equal(run.answers.length, 1, `it should read exactly one answer\n${showP(run)}`);
  const asked = run.answers[0]!;
  assert.ok(hasProposal(asked.stdout), `the proposal should be printed before the answer is read\n--- stdout when asked ---\n${asked.stdout}`);
  assert.ok(asked.stderr.includes(QUESTION), `stderr should hold "${QUESTION}" when the answer is read\n--- stderr when asked ---\n${asked.stderr}`);
  assert.equal(run.stderr.split(QUESTION).length - 1, 1, `the question should be written once\n${showP(run)}`);
});

for (const answer of ["y", "yes", "Y", "YES", "Yes", "yEs", "  y  ", " yes", "YES   ", "\ty\t"]) {
  test(`AC22 the answer ${JSON.stringify(answer)} opens the issue: one command runs`, async () => {
    const run = await proposeAnswering(answer);
    assert.equal(run.answers.length, 1, showP(run));
    assert.equal(run.runs.length, 1, `the answer ${JSON.stringify(answer)} should open the issue\n${showP(run)}`);
    assert.equal(run.runs[0]!.file, "gh", showP(run));
    assert.equal(run.code, 0, showP(run));
  });
}

for (const answer of ["", "n", "N", "no", "No", "yess", "ye", "y es", "yes please", "sure", "ok", "1", "true", "oui"]) {
  test(`AC22 the answer ${JSON.stringify(answer)} runs no command, writes 'not opened' and exits 0`, async () => {
    const run = await proposeAnswering(answer);
    assert.equal(run.answers.length, 1, showP(run));
    assert.equal(run.runs.length, 0, `the answer ${JSON.stringify(answer)} ran a command\n${showP(run)}`);
    assert.ok(stderrLines(run).includes(NOT_OPENED), `stderr should say "${NOT_OPENED}"\n${showP(run)}`);
    assert.ok(!run.stdout.includes("opened: "), `stdout says it opened something\n${showP(run)}`);
    assert.equal(run.code, 0, showP(run));
  });
}

test("AC22 with no terminal (no way to answer) it asks nothing, runs no command, says why on stderr and exits 0", async () => {
  const run = await proposeAnswering("absent");
  assert.ok(hasProposal(run.stdout), `the proposal should still be printed\n${showP(run)}`);
  assert.ok(!run.stderr.includes("Open this proposal"), `it asked the question with no terminal\n${showP(run)}`);
  assert.equal(run.runs.length, 0, `it ran a command\n${showP(run)}`);
  assert.ok(stderrLines(run).includes(NO_TERMINAL), `stderr should say "${NO_TERMINAL}"\n${showP(run)}`);
  assert.equal(run.code, 0, showP(run));
});

test("AC22 when the answer reports no terminal (null), it runs no command, says why on stderr and exits 0", async () => {
  const run = await proposeAnswering(null);
  assert.ok(hasProposal(run.stdout), `the proposal should still be printed\n${showP(run)}`);
  assert.equal(run.runs.length, 0, `it ran a command\n${showP(run)}`);
  assert.ok(stderrLines(run).includes(NO_TERMINAL), `stderr should say "${NO_TERMINAL}"\n${showP(run)}`);
  assert.equal(run.code, 0, showP(run));
});
