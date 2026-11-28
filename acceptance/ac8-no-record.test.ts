// AC8: `flight retro` keeps no record of its own: the log's bytes are identical after it runs, it creates no
// file in $HOME, in $XDG_STATE_HOME or in the log's folder (other than SQLite's -wal and -shm beside the log),
// two runs on the same log cover the same changes, and no request to the model holds a full folder path.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { notEnoughData } from "./fixtures/replies.ts";
import { ALPHA_PATH, ALPHA_TWIN_PATH, BETA_PATH, DETAIL_EVENTS, GAMMA_PATH, RANGE_EVENTS } from "./fixtures/retro.ts";
import { changeHeadings, filesUnder, retro, retroSetup } from "./retro-support.ts";
import { envFor, makeLog, sha256, show, tempDir, type Run } from "./support.ts";

const NEEDS = "more accepted changes";

function assertNothingNew(before: Map<string, string[]>, log: string, run: Run): void {
  const allowed = new Set([`${basename(log)}-wal`, `${basename(log)}-shm`]);
  for (const [dir, files] of before) {
    const added = filesUnder(dir).filter((f) => !files.includes(f));
    const extra = dir === dirname(log) ? added.filter((f) => !allowed.has(f)) : added;
    assert.deepEqual(extra, [], `flight retro created ${extra.join(", ")} in ${dir}\n${show(run)}`);
  }
}

function snapshot(dirs: string[]): Map<string, string[]> {
  return new Map(dirs.map((dir) => [dir, filesUnder(dir)]));
}

test("AC8 flight retro --log leaves the log's bytes identical and creates no file in $HOME, $XDG_STATE_HOME or the log's folder", async () => {
  const dir = tempDir();
  const home = join(dir, "home");
  const state = join(dir, "state");
  mkdirSync(home);
  mkdirSync(state);
  const log = makeLog(join(dir, "logs", "events.db"), RANGE_EVENTS);
  const hash = sha256(log);
  const before = snapshot([home, state, dirname(log)]);
  const run = await retro(["--log", log], { env: envFor(home, state), replies: [notEnoughData(NEEDS)] });
  assert.equal(run.code, 0, show(run));
  assert.equal(changeHeadings(run.stdout).length, 5, `the retro should cover 5 changes\n${show(run)}`);
  assert.equal(sha256(log), hash, "the log's bytes changed");
  assertNothingNew(before, log, run);
});

test("AC8 flight retro on the default log leaves it identical and creates no file in $HOME or $XDG_STATE_HOME", async () => {
  const dir = tempDir();
  const home = join(dir, "home");
  const state = join(dir, "state");
  mkdirSync(home);
  const log = makeLog(join(state, "orc", "events.db"), RANGE_EVENTS);
  const hash = sha256(log);
  const before = snapshot([home, state]);
  const run = await retro([], { env: envFor(home, state), replies: [notEnoughData(NEEDS)] });
  assert.equal(run.code, 0, show(run));
  assert.equal(changeHeadings(run.stdout).length, 5, `the retro should cover 5 changes\n${show(run)}`);
  assert.equal(sha256(log), hash, "the log's bytes changed");
  // The log's folder is inside $XDG_STATE_HOME, so its -wal and -shm are the only new files allowed there.
  const allowed = new Set([join("orc", "events.db-wal"), join("orc", "events.db-shm")]);
  const added = filesUnder(state).filter((f) => !before.get(state)!.includes(f) && !allowed.has(f));
  assert.deepEqual(added, [], `flight retro created ${added.join(", ")} in $XDG_STATE_HOME\n${show(run)}`);
  const addedHome = filesUnder(home).filter((f) => !before.get(home)!.includes(f));
  assert.deepEqual(addedHome, [], `flight retro created ${addedHome.join(", ")} in $HOME\n${show(run)}`);
});

test("AC8 two runs of flight retro on the same log cover the same changes", async () => {
  const dir = tempDir();
  const home = join(dir, "home");
  const state = join(dir, "state");
  mkdirSync(home);
  const log = makeLog(join(state, "orc", "events.db"), RANGE_EVENTS);
  const env = envFor(home, state);
  const firstRun = await retro([], { env, replies: [notEnoughData(NEEDS)] });
  const secondRun = await retro([], { env, replies: [notEnoughData(NEEDS)] });
  const firstHeadings = changeHeadings(firstRun.stdout);
  assert.equal(firstHeadings.length, 5, `the first run should cover 5 changes\n${show(firstRun)}`);
  assert.deepEqual(changeHeadings(secondRun.stdout), firstHeadings, `the second run covered other changes\n${show(secondRun)}`);
  const withSince = await retro(["--since", "2026-10-09"], { env, replies: [notEnoughData(NEEDS)] });
  const againWithSince = await retro(["--since", "2026-10-09"], { env, replies: [notEnoughData(NEEDS)] });
  assert.equal(changeHeadings(withSince.stdout).length, 3, `--since 2026-10-09 should cover 3 changes\n${show(withSince)}`);
  assert.deepEqual(changeHeadings(againWithSince.stdout), changeHeadings(withSince.stdout), `the second --since run covered other changes\n${show(againWithSince)}`);
});

for (const [name, events] of [
  ["the range log", RANGE_EVENTS],
  ["the detail log, whose notes name other folders", DETAIL_EVENTS],
] as const) {
  test(`AC8 no request flight retro sends to the model holds a project's full folder path, only its last segment (${name})`, async () => {
    const { log, env } = retroSetup(events);
    const run = await retro(["--log", log], { env, replies: [notEnoughData(NEEDS)] });
    assert.equal(run.requests.length, 1, `the retro should send one request\n${show(run)}`);
    for (const [i, request] of run.requests.entries()) {
      for (const path of [ALPHA_PATH, BETA_PATH, GAMMA_PATH, ALPHA_TWIN_PATH, "/Users/someone"]) {
        assert.ok(!request.body.includes(path), `request ${i + 1} to the model holds the path ${path}`);
      }
      assert.ok(request.body.includes("alpha-shop"), `request ${i + 1} does not name alpha-shop by its last segment`);
      assert.ok(request.body.includes("beta-site"), `request ${i + 1} does not name beta-site by its last segment`);
    }
  });
}
