// AC23: when `gh` runs for more than 60 seconds, `flight propose` says `stopped: could not open the issue: ` and
// why on stderr, and exits 1. The fake `gh` never settles until the signal it is given aborts.
// In its own file so it runs alongside the other acceptance tests rather than after them.

import { test } from "node:test";
import assert from "node:assert/strict";

import { DETAIL_EVENTS } from "./fixtures/retro.ts";
import { GOOD, RETRO_REPLY, proposalReply } from "./fixtures/propose.ts";
import { retroSetup } from "./retro-support.ts";
import { lines } from "./support.ts";
import { propose, showP } from "./propose-support.ts";

test("AC23 when gh runs for more than 60 seconds it is stopped: 'stopped: could not open the issue: ' and why, exit 1", { timeout: 150_000 }, async () => {
  const { log, env } = retroSetup(DETAIL_EVENTS);
  const run = await propose(["--log", log], { env, replies: [RETRO_REPLY, proposalReply(GOOD)], answer: "y", gh: { kind: "hang" } });
  assert.equal(run.runs.length, 1, showP(run));
  assert.ok(run.runs[0]!.signal instanceof AbortSignal, `gh should be given an AbortSignal\n${showP(run)}`);
  assert.equal(run.code, 1, showP(run));
  const line = lines(run.stderr).find((l) => l.includes("stopped: could not open the issue: "));
  assert.ok(line, `stderr should say "stopped: could not open the issue: " and why\n${showP(run)}`);
  assert.ok(line.trim().length > "stopped: could not open the issue: ".length, `stderr should say why: ${line}`);
  assert.ok(run.seconds >= 58 && run.seconds < 100, `gh was stopped after ${run.seconds.toFixed(1)} seconds, not about 60`);
  assert.ok(!run.stdout.includes("opened: "), `stdout says it opened the issue\n${showP(run)}`);
});
