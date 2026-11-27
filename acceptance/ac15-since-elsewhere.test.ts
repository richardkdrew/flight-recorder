// AC15 (existing): `--since` belongs to `retro` only: `flight ask "<question>" --since 2026-01-01` and
// `flight seed <file> --since 2026-01-01` still exit 2 with a usage error, send no request and create no file.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { answer, toolUse } from "./fixtures/replies.ts";
import { E9 } from "./fixtures/events.ts";
import { filesUnder } from "./retro-support.ts";
import { envFor, flight, makeLog, show, tempDir } from "./support.ts";

test('AC15 flight ask "<question>" --since 2026-01-01 exits 2 with a usage error, sends no request and creates no file', async () => {
  const dir = tempDir();
  const home = join(dir, "home");
  const state = join(dir, "state");
  mkdirSync(home);
  makeLog(join(state, "orc", "events.db"));
  const before = filesUnder(dir);
  const run = await flight(["ask", "What happened last week?", "--since", "2026-01-01"], {
    env: envFor(home, state),
    replies: [toolUse("find_events", { type: "orc.friction.noted.v1" }), answer("AC15-ASK: one friction note.", [E9])],
  });
  assert.equal(run.code, 2, show(run));
  assert.match(run.stderr, /usage/i, `stderr should hold a usage error\n${show(run)}`);
  assert.equal(run.requests.length, 0, `no request should reach the model\n${show(run)}`);
  assert.deepEqual(filesUnder(dir), before, "flight ask created a file");
});

test("AC15 flight seed <file> --since 2026-01-01 exits 2 with a usage error, sends no request and creates no file", async () => {
  const dir = tempDir();
  const home = join(dir, "home");
  mkdirSync(home);
  const file = join(dir, "seeded.db");
  const before = filesUnder(dir);
  const run = await flight(["seed", file, "--since", "2026-01-01"], { env: envFor(home, join(dir, "state")) });
  assert.equal(run.code, 2, show(run));
  assert.match(run.stderr, /usage/i, `stderr should hold a usage error\n${show(run)}`);
  assert.equal(run.requests.length, 0, `no request should reach the model\n${show(run)}`);
  assert.equal(existsSync(file), false, `flight seed wrote ${file}`);
  assert.deepEqual(filesUnder(dir), before, "flight seed created a file");
});
