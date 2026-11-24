// AC3: an answer is shown only when every id it cites is an event or delivery id in the log
// that a tool returned during that same question; otherwise it is withheld.

import { test } from "node:test";
import assert from "node:assert/strict";

import { COMMIT2, D1, D2, E1, E2, E3, E5, E9, MISSING_ID } from "./fixtures/events.ts";
import { answer, toolUse } from "./fixtures/replies.ts";
import { flight, lines, setup, show, type Run } from "./support.ts";

const QUESTION = "How did the add-cart change go?";

function assertShown(run: Run, text: string, cites: string[]): void {
  assert.equal(run.code, 0, show(run));
  const out = lines(run.stdout);
  const cited = `cited: ${cites.join(", ")}`;
  const citedAt = out.indexOf(cited);
  assert.ok(citedAt >= 0, `no line "${cited}" on stdout\n${show(run)}`);
  const textAt = run.stdout.indexOf(text);
  assert.ok(textAt >= 0, `the answer text is not on stdout\n${show(run)}`);
  assert.ok(textAt < run.stdout.indexOf(`\n${cited}`) + 1, `the answer text should come before the cited line\n${show(run)}`);
}

function assertWithheld(run: Run, text: string, failed: string[], passed: string[] = []): void {
  assert.equal(run.code, 1, show(run));
  const line = lines(run.stderr).find((l) => l.includes("answer withheld:"));
  assert.ok(line, `stderr has no "answer withheld:" line\n${show(run)}`);
  const rest = line.slice(line.indexOf("answer withheld:"));
  for (const id of failed) assert.ok(rest.includes(id), `the withheld line does not name ${id}: ${line}`);
  for (const id of passed) assert.ok(!rest.includes(id), `the withheld line names ${id}, which passed: ${line}`);
  assert.ok(!run.stdout.includes(text) && !run.stderr.includes(text), `the answer text was printed\n${show(run)}`);
  assert.ok(!lines(run.stdout).some((l) => l.startsWith("cited:")), `a cited line was printed\n${show(run)}`);
}

test("AC3 an answer citing an event id and a delivery id that read_delivery returned is printed, then its cited line, exit 0", async () => {
  const { log, env } = setup();
  const text = "AC3-SHOWN-READ: add-cart passed 12 checks and was accepted.";
  const run = await flight(["ask", QUESTION, "--log", log], {
    env,
    replies: [toolUse("read_delivery", { delivery: D1 }), answer(text, [E2, D1])],
  });
  assertShown(run, text, [E2, D1]);
});

test("AC3 an answer citing a delivery id that list_deliveries returned is printed with its cited line", async () => {
  const { log, env } = setup();
  const text = "AC3-SHOWN-LIST: fix-totals is the newest alpha-shop delivery.";
  const run = await flight(["ask", QUESTION, "--log", log], {
    env,
    replies: [toolUse("list_deliveries", {}), answer(text, [D2])],
  });
  assertShown(run, text, [D2]);
});

test("AC3 an answer citing an event id that find_events returned is printed with its cited line", async () => {
  const { log, env } = setup();
  const text = "AC3-SHOWN-FIND: the one friction note is about waiting overnight.";
  const run = await flight(["ask", QUESTION, "--log", log], {
    env,
    replies: [toolUse("find_events", { type: "orc.friction.noted.v1" }), answer(text, [E9])],
  });
  assertShown(run, text, [E9]);
});

test("AC3 the cited line lists every cited id in the reply's order, without duplicates", async () => {
  const { log, env } = setup();
  const text = "AC3-ORDER: judged after its checks, and started with the agent.";
  const run = await flight(["ask", QUESTION, "--log", log], {
    env,
    replies: [toolUse("read_delivery", { delivery: D1 }), answer(text, [E3, E1, E3, D1])],
  });
  assertShown(run, text, [E3, E1, D1]);
});

test("AC3 an answer citing an id that is in the log but no tool returned during the question is withheld, exit 1", async () => {
  const { log, env } = setup();
  const text = "AC3-NOT-RETURNED: fix-totals had one blocking finding.";
  const run = await flight(["ask", QUESTION, "--log", log], {
    env,
    replies: [toolUse("read_delivery", { delivery: D1 }), answer(text, [E2, E5])],
  });
  assertWithheld(run, text, [E5], [E2]);
});

test("AC3 an answer citing an id that is not in the log is withheld, exit 1", async () => {
  const { log, env } = setup();
  const text = "AC3-MISSING: a delivery that never happened.";
  const run = await flight(["ask", QUESTION, "--log", log], {
    env,
    replies: [toolUse("read_delivery", { delivery: D1 }), answer(text, [MISSING_ID])],
  });
  assertWithheld(run, text, [MISSING_ID]);
});

test("AC3 an answer citing a value a tool returned that is not an event or delivery id is withheld, exit 1", async () => {
  const { log, env } = setup();
  const text = "AC3-COMMIT: the review was on this commit.";
  const run = await flight(["ask", QUESTION, "--log", log], {
    env,
    replies: [toolUse("read_delivery", { delivery: D2 }), answer(text, [COMMIT2])],
  });
  assertWithheld(run, text, [COMMIT2]);
});

test("AC3 an answer that cites nothing is withheld with 'it cited nothing', exit 1", async () => {
  const { log, env } = setup();
  const text = "AC3-NOTHING: the factory is doing well.";
  const run = await flight(["ask", QUESTION, "--log", log], {
    env,
    replies: [toolUse("describe_log", {}), answer(text, [])],
  });
  assertWithheld(run, text, ["it cited nothing"]);
});

test("AC3 an id a tool returned in an earlier question does not count for the next question", async () => {
  const { log, env } = setup();
  const first = await flight(["ask", QUESTION, "--log", log], {
    env,
    replies: [toolUse("read_delivery", { delivery: D1 }), answer("AC3-FIRST: add-cart began with the agent.", [E1])],
  });
  assertShown(first, "AC3-FIRST: add-cart began with the agent.", [E1]);
  const text = "AC3-SECOND: add-cart began with the agent, as before.";
  const second = await flight(["ask", QUESTION, "--log", log], { env, replies: [answer(text, [E1])] });
  assertWithheld(second, text, [E1]);
});
