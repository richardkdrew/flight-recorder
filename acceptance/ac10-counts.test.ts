// AC10: each change's section has the line `build attempts: <a>, spec review rounds: <s>, code review
// rounds: <c>, rule stops: <r>, timeouts: <t>`, counted from that delivery's events only.

import { test } from "node:test";
import assert from "node:assert/strict";

import { notEnoughData } from "./fixtures/replies.ts";
import { DETAIL, DETAIL_EVENTS, DETAIL_HEADINGS, heading } from "./fixtures/retro.ts";
import { changeHeadings, retro, retroSetup, sectionOf } from "./retro-support.ts";
import { show } from "./support.ts";

const EXPECTED: [{ change: string; project: string }, string][] = [
  // 4 engineering runs (one failed, one timed out), 2 spec and 2 code reviews, 2 rules escalations
  // (the build attempts one is not a rule stop), and 2 timeouts (a test agent's and an engineering agent's).
  // The earlier delivery of rich-change, never accepted, adds nothing.
  [DETAIL.x, "build attempts: 4, spec review rounds: 2, code review rounds: 2, rule stops: 2, timeouts: 2"],
  // A frozen tests escalation is not a rule stop.
  [DETAIL.y, "build attempts: 2, spec review rounds: 0, code review rounds: 1, rule stops: 0, timeouts: 0"],
  [DETAIL.w, "build attempts: 1, spec review rounds: 0, code review rounds: 1, rule stops: 0, timeouts: 0"],
];

test("AC10 each change's section has its counts line, from its own delivery's events", async () => {
  const { log, env } = retroSetup(DETAIL_EVENTS);
  const run = await retro(["--log", log], { env, replies: [notEnoughData("more accepted changes")] });
  assert.deepEqual(changeHeadings(run.stdout), DETAIL_HEADINGS, show(run));
  for (const [d, line] of EXPECTED) {
    const section = sectionOf(run, heading(d));
    const counts = section.lines.filter((l) => l.trim().startsWith("build attempts:")).map((l) => l.trim());
    assert.deepEqual(counts, [line], `the section "${heading(d)}" should have the line "${line}"\n${show(run)}`);
  }
});
