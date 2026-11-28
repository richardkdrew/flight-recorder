// AC19: with no override, a proposal whose request gets no reply stops after 120 seconds, the retro printed.
// In its own file so it runs alongside the other acceptance tests rather than after them.

import { test } from "node:test";
import assert from "node:assert/strict";

import { HANG } from "./fixtures/replies.ts";
import { DETAIL_EVENTS } from "./fixtures/retro.ts";
import { RETRO_REPLY } from "./fixtures/propose.ts";
import { assertNothingOffered, assertStartsWithRetro, propose, showP, withRetro } from "./propose-support.ts";

test("AC19 a proposal with no reply from the model is stopped after 120 seconds by default, after the retro, exit 1", { timeout: 200_000 }, async () => {
  const { log, env, retroRun } = await withRetro(DETAIL_EVENTS, [], [RETRO_REPLY]);
  const run = await propose(["--log", log], { env, replies: [RETRO_REPLY, HANG] });
  assert.equal(run.code, 1, showP(run));
  assert.equal(run.requests.length, 2, showP(run));
  assert.ok(run.stderr.includes("stopped: no answer within 120 seconds"), `stderr should say "stopped: no answer within 120 seconds"\n${showP(run)}`);
  assert.ok(run.seconds >= 115 && run.seconds < 160, `it stopped after ${run.seconds.toFixed(1)} seconds, not about 120`);
  assertStartsWithRetro(run, retroRun);
  assertNothingOffered(run);
});
