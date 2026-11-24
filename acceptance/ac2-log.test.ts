// AC2: `flight ask` reads the log `--log` names, or the factory's default log, never changes it,
// refuses a path with no file, and sends the model each project's last path segment only.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { ALPHA_PATH, BETA_PATH, D1, D3, E2, E7, E9, PRIVATE_PARENTS } from "./fixtures/events.ts";
import { answer, toolUse } from "./fixtures/replies.ts";
import { envFor, flight, lines, makeLog, setup, sha256, show, tempDir, toolResultTexts } from "./support.ts";

const QUESTION = "What happened in the factory's deliveries?";

function assertAnswered(run: Awaited<ReturnType<typeof flight>>, text: string, cited: string): void {
  assert.equal(run.code, 0, show(run));
  assert.ok(run.stdout.includes(text), `the answer text is not on stdout\n${show(run)}`);
  assert.ok(lines(run.stdout).includes(cited), `no line "${cited}" on stdout\n${show(run)}`);
}

test("AC2 flight ask leaves the log's bytes identical after a question that runs every tool", async () => {
  const { log, env } = setup();
  const before = sha256(log);
  const text = "AC2-UNCHANGED: delivery d1 passed its checks.";
  const run = await flight(["ask", QUESTION, "--log", log], {
    env,
    replies: [
      toolUse("describe_log", {}),
      toolUse("list_deliveries", {}),
      toolUse("read_delivery", { delivery: D1 }),
      toolUse("find_events", { type: "orc.checks.recorded.v1" }),
      answer(text, [E2]),
    ],
  });
  assert.equal(run.requests.length, 5, `the question should make 5 model calls\n${show(run)}`);
  assertAnswered(run, text, `cited: ${E2}`);
  assert.equal(sha256(log), before, "the log's bytes changed");
});

test("AC2 flight ask reads $XDG_STATE_HOME/orc/events.db by default and leaves it unchanged", async () => {
  const dir = tempDir();
  const state = join(dir, "state");
  const log = makeLog(join(state, "orc", "events.db"));
  const before = sha256(log);
  const text = "AC2-XDG: one friction note so far.";
  const run = await flight(["ask", QUESTION], {
    env: envFor(join(dir, "home"), state),
    replies: [toolUse("find_events", { type: "orc.friction.noted.v1" }), answer(text, [E9])],
  });
  assertAnswered(run, text, `cited: ${E9}`);
  assert.ok(toolResultTexts(run.requests).some((t) => t.includes(E9)), "the tool result did not come from the default log");
  assert.equal(sha256(log), before, "the log's bytes changed");
});

test("AC2 flight ask reads ~/.local/state/orc/events.db by default when XDG_STATE_HOME is unset", async () => {
  const dir = tempDir();
  const home = join(dir, "home");
  const log = makeLog(join(home, ".local", "state", "orc", "events.db"));
  const before = sha256(log);
  const text = "AC2-HOME: one friction note so far.";
  const saved = { HOME: process.env.HOME, XDG_STATE_HOME: process.env.XDG_STATE_HOME };
  process.env.HOME = home;
  delete process.env.XDG_STATE_HOME;
  try {
    const run = await flight(["ask", QUESTION], {
      env: envFor(home),
      replies: [toolUse("find_events", { type: "orc.friction.noted.v1" }), answer(text, [E9])],
    });
    assertAnswered(run, text, `cited: ${E9}`);
    assert.ok(toolResultTexts(run.requests).some((t) => t.includes(E9)), "the tool result did not come from the default log");
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  assert.equal(sha256(log), before, "the log's bytes changed");
});

test("AC2 flight ask --log naming no file exits 1 with 'no event log at <path>' and creates no file there", async () => {
  const dir = tempDir();
  const missing = join(dir, "events.db");
  const run = await flight(["ask", QUESTION, "--log", missing], { env: envFor(join(dir, "home"), join(dir, "state")) });
  assert.equal(run.code, 1, show(run));
  assert.ok(run.stderr.includes(`no event log at ${missing}`), `stderr should say "no event log at ${missing}"\n${show(run)}`);
  assert.equal(existsSync(missing), false, `a file was created at ${missing}`);
});

test("AC2 flight ask with no file at $XDG_STATE_HOME/orc/events.db exits 1 with 'no event log at <path>' and creates no file there", async () => {
  const dir = tempDir();
  const state = join(dir, "state");
  const missing = join(state, "orc", "events.db");
  const run = await flight(["ask", QUESTION], { env: envFor(join(dir, "home"), state) });
  assert.equal(run.code, 1, show(run));
  assert.ok(run.stderr.includes(`no event log at ${missing}`), `stderr should say "no event log at ${missing}"\n${show(run)}`);
  assert.equal(existsSync(missing), false, `a file was created at ${missing}`);
});

test("AC2 flight ask with XDG_STATE_HOME unset and no file at ~/.local/state/orc/events.db exits 1 with 'no event log at <path>'", async () => {
  const dir = tempDir();
  const home = join(dir, "home");
  const missing = join(home, ".local", "state", "orc", "events.db");
  const saved = { HOME: process.env.HOME, XDG_STATE_HOME: process.env.XDG_STATE_HOME };
  process.env.HOME = home;
  delete process.env.XDG_STATE_HOME;
  let run;
  try {
    run = await flight(["ask", QUESTION], { env: envFor(home) });
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  assert.equal(run.code, 1, show(run));
  assert.ok(run.stderr.includes(`no event log at ${missing}`), `stderr should say "no event log at ${missing}"\n${show(run)}`);
  assert.equal(existsSync(missing), false, `a file was created at ${missing}`);
});

test("AC2 no request sent to the model holds a project's full folder path, only its last segment", async () => {
  const { log, env } = setup();
  const text = "AC2-PRIVATE: beta-site's landing page was built and previewed.";
  const run = await flight(["ask", QUESTION, "--log", log], {
    env,
    replies: [
      toolUse("describe_log", {}),
      toolUse("list_deliveries", {}),
      toolUse("list_deliveries", { project: "alpha-shop" }),
      toolUse("read_delivery", { delivery: D3 }),
      toolUse("find_events", {}),
      toolUse("find_events", { project: "beta-site" }),
      toolUse("find_events", { type: "orc.friction.noted.v1" }),
      answer(text, [D3]),
    ],
  });
  assert.equal(run.requests.length, 8, `the question should make 8 model calls\n${show(run)}`);
  assertAnswered(run, text, `cited: ${D3}`);
  for (const [i, request] of run.requests.entries()) {
    for (const path of [ALPHA_PATH, BETA_PATH, ...PRIVATE_PARENTS]) {
      assert.ok(!request.body.includes(path), `request ${i + 1} to the model holds the path ${path}`);
    }
  }
  const results = toolResultTexts(run.requests).join("\n");
  assert.ok(results.includes(E7), "the tool results sent to the model do not hold delivery d3's events");
  assert.ok(results.includes("alpha-shop"), "the tool results do not name the project alpha-shop by its last segment");
  assert.ok(results.includes("beta-site"), "the tool results do not name the project beta-site by its last segment");
});
