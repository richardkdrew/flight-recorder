// AC5: with no override, a question with no final reply stops after 120 seconds.
// In its own file so it runs alongside the other acceptance tests rather than after them.

import { test } from "node:test";
import assert from "node:assert/strict";

import { HANG } from "./fixtures/replies.ts";
import { flight, lines, setup, show } from "./support.ts";

test("AC5 a question with no final reply is stopped after 120 seconds by default, exit 1", { timeout: 200_000 }, async () => {
  const { log, env } = setup();
  const run = await flight(["ask", "Which delivery took longest?", "--log", log], { env, replies: [HANG] });
  assert.equal(run.code, 1, show(run));
  assert.ok(run.stderr.includes("stopped: no answer within 120 seconds"), `stderr should say "stopped: no answer within 120 seconds"\n${show(run)}`);
  assert.ok(run.seconds >= 115 && run.seconds < 160, `it stopped after ${run.seconds.toFixed(1)} seconds, not about 120`);
  assert.ok(!lines(run.stdout).some((l) => l.startsWith("cited:")), `a cited line was printed\n${show(run)}`);
});
