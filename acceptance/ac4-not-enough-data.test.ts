// AC4: when the model's final reply says the data cannot support an answer,
// `flight ask` prints "not enough data yet: " and what it would need, and exits 0.

import { test } from "node:test";
import assert from "node:assert/strict";

import { notEnoughData, toolUse } from "./fixtures/replies.ts";
import { flight, lines, setup, show } from "./support.ts";

test("AC4 a reply that the data cannot support an answer prints 'not enough data yet: ' and what it needs, exit 0", async () => {
  const { log, env } = setup();
  const needs = "at least 5 accepted deliveries from each of two factory versions";
  const run = await flight(["ask", "Did the newer factory version cut review rounds?", "--log", log], {
    env,
    replies: [toolUse("describe_log", {}), toolUse("list_deliveries", {}), notEnoughData(needs)],
  });
  assert.equal(run.code, 0, show(run));
  assert.ok(lines(run.stdout).includes(`not enough data yet: ${needs}`), `no line "not enough data yet: ${needs}" on stdout\n${show(run)}`);
});

test("AC4 a first reply that the data cannot support an answer, with no tool call, prints what it needs, exit 0", async () => {
  const { log, env } = setup();
  const needs = "events that record the cost of each review round";
  const run = await flight(["ask", "How much did review rounds cost last month?", "--log", log], {
    env,
    replies: [notEnoughData(needs)],
  });
  assert.equal(run.code, 0, show(run));
  assert.ok(lines(run.stdout).includes(`not enough data yet: ${needs}`), `no line "not enough data yet: ${needs}" on stdout\n${show(run)}`);
});
