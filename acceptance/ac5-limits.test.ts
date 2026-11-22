// AC5: a question stops at its cap of model calls (10 by default) or at its timeout,
// prints no answer text, and exits 1. The default 120-second timeout is in ac5-default-timeout.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";

import { D1, E1 } from "./fixtures/events.ts";
import { HANG, answer, delayed, toolUse, type Reply } from "./fixtures/replies.ts";
import { flight, lines, setup, show, type Run } from "./support.ts";

const QUESTION = "Which delivery took longest?";

function keepsAskingForTools(calls: number, text: string): Reply[] {
  const replies: Reply[] = [];
  for (let i = 0; i < calls; i++) replies.push(toolUse("read_delivery", { delivery: D1 }));
  // Served only if the question makes one call more than its cap.
  replies.push(answer(text, [E1]));
  return replies;
}

function assertNoAnswer(run: Run, text?: string): void {
  if (text) assert.ok(!run.stdout.includes(text) && !run.stderr.includes(text), `the answer text was printed\n${show(run)}`);
  assert.ok(!lines(run.stdout).some((l) => l.startsWith("cited:")), `a cited line was printed\n${show(run)}`);
}

test("AC5 a model that keeps asking for tools is stopped after 10 model calls by default, exit 1", { timeout: 60_000 }, async () => {
  const { log, env } = setup();
  const text = "AC5-CAP-DEFAULT: the eleventh call's answer.";
  const run = await flight(["ask", QUESTION, "--log", log], { env, replies: keepsAskingForTools(12, text) });
  assert.equal(run.code, 1, show(run));
  assert.ok(
    run.stderr.includes("stopped: reached the limit of 10 model calls for one question"),
    `stderr should say "stopped: reached the limit of 10 model calls for one question"\n${show(run)}`,
  );
  assert.equal(run.requests.length, 10, `the question should stop after 10 model calls\n${show(run)}`);
  assertNoAnswer(run, text);
});

test("AC5 a question's own cap of model calls is the one it stops at and names", { timeout: 60_000 }, async () => {
  const { log, env } = setup();
  const text = "AC5-CAP-3: the fourth call's answer.";
  const run = await flight(["ask", QUESTION, "--log", log], {
    env,
    replies: keepsAskingForTools(3, text),
    limits: { modelCalls: 3 },
  });
  assert.equal(run.code, 1, show(run));
  assert.ok(
    run.stderr.includes("stopped: reached the limit of 3 model calls for one question"),
    `stderr should say "stopped: reached the limit of 3 model calls for one question"\n${show(run)}`,
  );
  assert.equal(run.requests.length, 3, `the question should stop after 3 model calls\n${show(run)}`);
  assertNoAnswer(run, text);
});

test("AC5 a question with no final reply within its timeout prints 'stopped: no answer within <s> seconds', exit 1", { timeout: 60_000 }, async () => {
  const { log, env } = setup();
  const run = await flight(["ask", QUESTION, "--log", log], {
    env,
    replies: [toolUse("describe_log", {}), HANG],
    limits: { timeoutSeconds: 2 },
  });
  assert.equal(run.code, 1, show(run));
  assert.ok(run.stderr.includes("stopped: no answer within 2 seconds"), `stderr should say "stopped: no answer within 2 seconds"\n${show(run)}`);
  assert.ok(run.seconds >= 1.8 && run.seconds < 30, `it stopped after ${run.seconds.toFixed(1)} seconds, not about 2`);
  assertNoAnswer(run);
});

test("AC5 an answer that would arrive after the question's timeout is not printed, exit 1", { timeout: 60_000 }, async () => {
  const { log, env } = setup();
  const text = "AC5-LATE: an answer that came too late.";
  const run = await flight(["ask", QUESTION, "--log", log], {
    env,
    replies: [toolUse("read_delivery", { delivery: D1 }), delayed(6_000, answer(text, [E1]))],
    limits: { timeoutSeconds: 2 },
  });
  assert.equal(run.code, 1, show(run));
  assert.ok(run.stderr.includes("stopped: no answer within 2 seconds"), `stderr should say "stopped: no answer within 2 seconds"\n${show(run)}`);
  assert.ok(run.seconds < 5.5, `it waited ${run.seconds.toFixed(1)} seconds, past its 2-second timeout`);
  assertNoAnswer(run, text);
});
