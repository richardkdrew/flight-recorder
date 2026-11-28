// AC7: `flight retro --since <YYYY-MM-DD>` covers every change whose latest acceptance is at or after the
// start of that day in UTC, up to the 20 most recent; a value that is not such a date exits 2 with a usage
// error and sends no request to the model.

import { test } from "node:test";
import assert from "node:assert/strict";

import { notEnoughData } from "./fixtures/replies.ts";
import { RANGE, RANGE_EVENTS, heading, manyAccepted } from "./fixtures/retro.ts";
import { changeHeadings, retro, retroSetup } from "./retro-support.ts";
import { show } from "./support.ts";

const NEEDS = "more accepted changes";

test("AC7 --since covers every change accepted since that day, more than 5, instead of the last 5", async () => {
  const { log, env } = retroSetup(RANGE_EVENTS);
  const run = await retro(["--since", "2026-09-01", "--log", log], { env, replies: [notEnoughData(NEEDS)] });
  assert.deepEqual(
    changeHeadings(run.stdout),
    [
      heading(RANGE.first),
      heading(RANGE.second),
      heading(RANGE.third),
      heading(RANGE.fifth),
      heading(RANGE.reopened),
      heading(RANGE.sixth),
    ],
    `all 6 accepted changes should be covered, oldest acceptance first\n${show(run)}`,
  );
});

test("AC7 --since includes an acceptance at the very start of the day in UTC and leaves out one a minute before", async () => {
  // fifth-change was accepted at 2026-10-09T00:00:00+00:00, third-change at 2026-10-08T23:59:00+00:00,
  // and reopened-change first on 09-25 and last on 10-25.
  const { log, env } = retroSetup(RANGE_EVENTS);
  const run = await retro(["--since", "2026-10-09", "--log", log], { env, replies: [notEnoughData(NEEDS)] });
  assert.deepEqual(
    changeHeadings(run.stdout),
    [heading(RANGE.fifth), heading(RANGE.reopened), heading(RANGE.sixth)],
    `--since 2026-10-09 should cover fifth-change, reopened-change and sixth-change\n${show(run)}`,
  );
});

test("AC7 --since leaves out deliveries with no decision accepted", async () => {
  const { log, env } = retroSetup(RANGE_EVENTS);
  const run = await retro(["--since", "2026-10-29", "--log", log], { env, replies: [notEnoughData(NEEDS)] });
  assert.deepEqual(changeHeadings(run.stdout), [heading(RANGE.sixth)], `only sixth-change was accepted since 2026-10-29\n${show(run)}`);
});

test("AC7 --since with more than 20 changes accepted covers the 20 most recent", async () => {
  const many = manyAccepted(22);
  const { log, env } = retroSetup(many.events);
  const run = await retro(["--since", "2026-09-01", "--log", log], { env, replies: [notEnoughData(NEEDS)] });
  assert.deepEqual(changeHeadings(run.stdout), many.headings.slice(2), `change-03 to change-22 should be covered\n${show(run)}`);
});

for (const value of ["2026-13-01", "2026-02-30", "2026-1-05", "26-10-09", "20261009", "2026-10-09T00:00:00Z", "yesterday", ""]) {
  test(`AC7 --since ${JSON.stringify(value)} exits 2 with a usage error and sends no request to the model`, async () => {
    const { log, env } = retroSetup(RANGE_EVENTS);
    // The same command with a date in the right form makes a retro, so the error is about the value.
    const valid = await retro(["--since", "2026-10-09", "--log", log], { env, replies: [notEnoughData(NEEDS)] });
    assert.equal(valid.code, 0, `--since 2026-10-09 should make a retro\n${show(valid)}`);
    assert.ok(changeHeadings(valid.stdout).length > 0, `--since 2026-10-09 should print sections\n${show(valid)}`);
    const run = await retro(["--since", value, "--log", log], { env, replies: [notEnoughData(NEEDS)] });
    assert.equal(run.code, 2, show(run));
    assert.match(run.stderr, /usage/i, `stderr should hold a usage error\n${show(run)}`);
    assert.equal(run.requests.length, 0, `no request should reach the model\n${show(run)}`);
    assert.deepEqual(changeHeadings(run.stdout), [], `no section should be printed\n${show(run)}`);
  });
}
