// AC13: with no override, a retro whose model request gets no reply stops after 120 seconds.
// In its own file so it runs alongside the other acceptance tests rather than after them.

import { test } from "node:test";
import assert from "node:assert/strict";

import { HANG } from "./fixtures/replies.ts";
import { DETAIL_EVENTS, DETAIL_HEADINGS } from "./fixtures/retro.ts";
import { CAUSES, WENT_WELL, changeHeadings, retro, retroSetup, sections } from "./retro-support.ts";
import { show } from "./support.ts";

test("AC13 a retro with no reply from the model is stopped after 120 seconds by default, with its change sections, exit 1", { timeout: 200_000 }, async () => {
  const { log, env } = retroSetup(DETAIL_EVENTS);
  const run = await retro(["--log", log], { env, replies: [HANG] });
  assert.equal(run.code, 1, show(run));
  assert.ok(run.stderr.includes("stopped: no answer within 120 seconds"), `stderr should say "stopped: no answer within 120 seconds"\n${show(run)}`);
  assert.ok(run.seconds >= 115 && run.seconds < 160, `it stopped after ${run.seconds.toFixed(1)} seconds, not about 120`);
  assert.deepEqual(changeHeadings(run.stdout), DETAIL_HEADINGS, `the change sections should still be printed\n${show(run)}`);
  const headings = sections(run.stdout).map((s) => s.heading);
  assert.ok(!headings.includes(CAUSES) && !headings.includes(WENT_WELL), `causes or what went well were printed\n${show(run)}`);
});
