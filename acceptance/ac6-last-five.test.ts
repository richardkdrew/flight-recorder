// AC6: `flight retro` covers the 5 changes accepted most recently, by their latest `accepted` decision,
// one Markdown section each, oldest acceptance first, headed `## <change> (<project>)`; deliveries with no
// decision `accepted` get no section, and with fewer than 5 accepted changes it covers them all.

import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import { notEnoughData } from "./fixtures/replies.ts";
import { RANGE, RANGE_EVENTS, heading, onlyDeliveries } from "./fixtures/retro.ts";
import { changeHeadings, retro, retroSetup } from "./retro-support.ts";
import { envFor, makeLog, show, tempDir } from "./support.ts";

const NEEDS = "more accepted changes";

test("AC6 flight retro prints one section for each of the 5 most recently accepted changes, oldest acceptance first", async () => {
  const { log, env } = retroSetup(RANGE_EVENTS);
  const run = await retro(["--log", log], { env, replies: [notEnoughData(NEEDS)] });
  assert.deepEqual(
    changeHeadings(run.stdout),
    [heading(RANGE.second), heading(RANGE.third), heading(RANGE.fifth), heading(RANGE.reopened), heading(RANGE.sixth)],
    `the sections should be the 5 latest acceptances, oldest first\n${show(run)}`,
  );
});

test("AC6 a change accepted twice is placed by its latest acceptance, not its first", async () => {
  // reopened-change was first accepted before every other change and accepted again on 10-25.
  const { log, env } = retroSetup(RANGE_EVENTS);
  const run = await retro(["--log", log], { env, replies: [notEnoughData(NEEDS)] });
  const headings = changeHeadings(run.stdout);
  assert.ok(headings.includes(heading(RANGE.reopened)), `reopened-change should be covered\n${show(run)}`);
  assert.ok(
    headings.indexOf(heading(RANGE.reopened)) > headings.indexOf(heading(RANGE.fifth)) &&
      headings.indexOf(heading(RANGE.reopened)) < headings.indexOf(heading(RANGE.sixth)),
    `reopened-change should come between fifth-change and sixth-change\n${show(run)}`,
  );
});

test("AC6 deliveries with only merged, sent back or judged verdicts get no section", async () => {
  const { log, env } = retroSetup(RANGE_EVENTS);
  const run = await retro(["--log", log], { env, replies: [notEnoughData(NEEDS)] });
  assert.equal(changeHeadings(run.stdout).length, 5, `the 5 latest accepted changes should have sections\n${show(run)}`);
  for (const d of [RANGE.merged, RANGE.sentBack, RANGE.works, RANGE.problems]) {
    assert.ok(!changeHeadings(run.stdout).includes(heading(d)), `${d.change} has no decision accepted but has a section\n${show(run)}`);
    assert.ok(!run.stdout.includes(`## ${d.change}`), `${d.change} has a section\n${show(run)}`);
  }
});

test("AC6 with fewer than 5 accepted changes the retro covers them all", async () => {
  const events = onlyDeliveries(RANGE.first, RANGE.second, RANGE.third, RANGE.merged, RANGE.sentBack, RANGE.works, RANGE.problems);
  const { log, env } = retroSetup(events);
  const run = await retro(["--log", log], { env, replies: [notEnoughData(NEEDS)] });
  assert.deepEqual(
    changeHeadings(run.stdout),
    [heading(RANGE.first), heading(RANGE.second), heading(RANGE.third)],
    `the sections should be the 3 accepted changes, oldest first\n${show(run)}`,
  );
});

test("AC6 a section's heading names the change and its project's last path segment, never the full path", async () => {
  const { log, env } = retroSetup(RANGE_EVENTS);
  const run = await retro(["--log", log], { env, replies: [notEnoughData(NEEDS)] });
  assert.ok(run.stdout.split(/\r?\n/).includes("## sixth-change (beta-site)"), `no line "## sixth-change (beta-site)"\n${show(run)}`);
  assert.ok(run.stdout.split(/\r?\n/).includes("## fifth-change (alpha-shop)"), `no line "## fifth-change (alpha-shop)"\n${show(run)}`);
  assert.ok(!run.stdout.includes("/Users/someone"), `stdout holds a full folder path\n${show(run)}`);
});

test("AC6 flight retro with no --log reads the factory's default log", async () => {
  const dir = tempDir();
  const state = join(dir, "state");
  makeLog(join(state, "orc", "events.db"), RANGE_EVENTS);
  const run = await retro([], { env: envFor(join(dir, "home"), state), replies: [notEnoughData(NEEDS)] });
  assert.deepEqual(
    changeHeadings(run.stdout),
    [heading(RANGE.second), heading(RANGE.third), heading(RANGE.fifth), heading(RANGE.reopened), heading(RANGE.sixth)],
    `the sections should come from $XDG_STATE_HOME/orc/events.db\n${show(run)}`,
  );
});
