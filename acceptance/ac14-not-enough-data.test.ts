// AC14: with fewer than 2 changes covered, `flight retro` sends no request, prints its sections and
// `not enough data yet: causes need at least 2 accepted changes, and this range has <n>`, and exits 0;
// when the model's reply says the data cannot support causes, it prints `not enough data yet: ` and what
// the reply says it would need, and exits 0.

import { test } from "node:test";
import assert from "node:assert/strict";

import { notEnoughData } from "./fixtures/replies.ts";
import { DETAIL_EVENTS, DETAIL_HEADINGS, RANGE, heading, onlyDeliveries } from "./fixtures/retro.ts";
import { CAUSES, WENT_WELL, changeHeadings, retro, retroSetup, sections } from "./retro-support.ts";
import { lines, show } from "./support.ts";

test("AC14 with 1 accepted change the retro sends no request, prints its section and 'not enough data yet: ... has 1', exit 0", async () => {
  const { log, env } = retroSetup(onlyDeliveries(RANGE.first, RANGE.merged, RANGE.sentBack, RANGE.works));
  const run = await retro(["--log", log], { env, replies: [notEnoughData("should never be asked")] });
  assert.equal(run.code, 0, show(run));
  assert.equal(run.requests.length, 0, `no request should reach the model\n${show(run)}`);
  assert.deepEqual(changeHeadings(run.stdout), [heading(RANGE.first)], `first-change's section should be printed\n${show(run)}`);
  const expected = "not enough data yet: causes need at least 2 accepted changes, and this range has 1";
  assert.ok(lines(run.stdout).includes(expected), `no line "${expected}" on stdout\n${show(run)}`);
});

test("AC14 with no accepted change the retro sends no request and says 'not enough data yet: ... has 0', exit 0", async () => {
  const { log, env } = retroSetup(onlyDeliveries(RANGE.merged, RANGE.sentBack, RANGE.works, RANGE.problems));
  const run = await retro(["--log", log], { env, replies: [notEnoughData("should never be asked")] });
  assert.equal(run.code, 0, show(run));
  assert.equal(run.requests.length, 0, `no request should reach the model\n${show(run)}`);
  assert.deepEqual(changeHeadings(run.stdout), [], `no change has a section\n${show(run)}`);
  const expected = "not enough data yet: causes need at least 2 accepted changes, and this range has 0";
  assert.ok(lines(run.stdout).includes(expected), `no line "${expected}" on stdout\n${show(run)}`);
});

test("AC14 --since covering 1 accepted change sends no request and says the range has 1, exit 0", async () => {
  const { log, env } = retroSetup(onlyDeliveries(RANGE.first, RANGE.second, RANGE.sixth));
  const run = await retro(["--since", "2026-10-29", "--log", log], { env, replies: [notEnoughData("should never be asked")] });
  assert.equal(run.code, 0, show(run));
  assert.equal(run.requests.length, 0, `no request should reach the model\n${show(run)}`);
  assert.deepEqual(changeHeadings(run.stdout), [heading(RANGE.sixth)], show(run));
  const expected = "not enough data yet: causes need at least 2 accepted changes, and this range has 1";
  assert.ok(lines(run.stdout).includes(expected), `no line "${expected}" on stdout\n${show(run)}`);
});

test("AC14 a reply that the data cannot support causes prints 'not enough data yet: ' and what it needs, with the sections, exit 0", async () => {
  const { log, env } = retroSetup(DETAIL_EVENTS);
  const needs = "at least 5 accepted changes from the same factory version";
  const run = await retro(["--log", log], { env, replies: [notEnoughData(needs)] });
  assert.equal(run.code, 0, show(run));
  assert.equal(run.requests.length, 1, `the retro should send one request\n${show(run)}`);
  assert.deepEqual(changeHeadings(run.stdout), DETAIL_HEADINGS, `the change sections should be printed\n${show(run)}`);
  assert.ok(lines(run.stdout).includes(`not enough data yet: ${needs}`), `no line "not enough data yet: ${needs}" on stdout\n${show(run)}`);
  const headings = sections(run.stdout).map((s) => s.heading);
  assert.ok(!headings.includes(CAUSES) && !headings.includes(WENT_WELL), `causes or what went well were printed\n${show(run)}`);
});
