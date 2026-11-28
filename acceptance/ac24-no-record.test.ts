// AC24: `flight propose` keeps no record of its own: the log's bytes are identical after it runs, it creates no
// file in $HOME, in $XDG_STATE_HOME or in the log's folder (other than SQLite's -wal and -shm beside the log), and
// neither request it sends holds a project's full folder path, only its last segment.
// Each run goes the whole way: the retro, the proposal, the answer `y` and the (fake) gh opening the issue.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { ALPHA_PATH, ALPHA_TWIN_PATH, BETA_PATH, GAMMA_PATH } from "./fixtures/retro.ts";
import { DELTA_PATH, GOOD, PROPOSE_EVENTS, RETRO_REPLY, proposalReply } from "./fixtures/propose.ts";
import { filesUnder, retroSetup } from "./retro-support.ts";
import { envFor, makeLog, sha256, tempDir } from "./support.ts";
import { ISSUE_URL, hasProposal, propose, showP, type ProposeRun } from "./propose-support.ts";

const REPLIES = [RETRO_REPLY, proposalReply(GOOD)];

function snapshot(dirs: string[]): Map<string, string[]> {
  return new Map(dirs.map((dir) => [dir, filesUnder(dir)]));
}

function assertRanThrough(run: ProposeRun): void {
  assert.equal(run.code, 0, showP(run));
  assert.ok(hasProposal(run.stdout), `the proposal should be printed\n${showP(run)}`);
  assert.equal(run.runs.length, 1, `the (fake) gh should have run\n${showP(run)}`);
  assert.ok(run.stdout.includes(`opened: ${ISSUE_URL}`), showP(run));
}

test("AC24 flight propose --log leaves the log's bytes identical and creates no file in $HOME, $XDG_STATE_HOME or the log's folder", async () => {
  const dir = tempDir();
  const home = join(dir, "home");
  const state = join(dir, "state");
  mkdirSync(home);
  mkdirSync(state);
  const log = makeLog(join(dir, "logs", "events.db"), PROPOSE_EVENTS);
  const hash = sha256(log);
  const before = snapshot([home, state, dirname(log)]);
  const run = await propose(["--log", log], { env: envFor(home, state), replies: REPLIES, answer: "y" });
  assertRanThrough(run);
  assert.equal(sha256(log), hash, "the log's bytes changed");
  const allowed = new Set([`${basename(log)}-wal`, `${basename(log)}-shm`]);
  for (const [folder, files] of before) {
    const added = filesUnder(folder).filter((f) => !files.includes(f));
    const extra = folder === dirname(log) ? added.filter((f) => !allowed.has(f)) : added;
    assert.deepEqual(extra, [], `flight propose created ${extra.join(", ")} in ${folder}\n${showP(run)}`);
  }
});

test("AC24 flight propose on the default log leaves it identical and creates no file in $HOME or $XDG_STATE_HOME", async () => {
  const dir = tempDir();
  const home = join(dir, "home");
  const state = join(dir, "state");
  mkdirSync(home);
  const log = makeLog(join(state, "orc", "events.db"), PROPOSE_EVENTS);
  const hash = sha256(log);
  const before = snapshot([home, state]);
  const run = await propose([], { env: envFor(home, state), replies: REPLIES, answer: "y" });
  assertRanThrough(run);
  assert.equal(sha256(log), hash, "the log's bytes changed");
  // The log's folder is inside $XDG_STATE_HOME, so its -wal and -shm are the only new files allowed there.
  const allowed = new Set([join("orc", "events.db-wal"), join("orc", "events.db-shm")]);
  const added = filesUnder(state).filter((f) => !before.get(state)!.includes(f) && !allowed.has(f));
  assert.deepEqual(added, [], `flight propose created ${added.join(", ")} in $XDG_STATE_HOME\n${showP(run)}`);
  const addedHome = filesUnder(home).filter((f) => !before.get(home)!.includes(f));
  assert.deepEqual(addedHome, [], `flight propose created ${addedHome.join(", ")} in $HOME\n${showP(run)}`);
});

for (const [name, args] of [
  ["the last 5 changes", []],
  ["--since 2026-11-01", ["--since", "2026-11-01"]],
] as const) {
  test(`AC24 neither request flight propose sends holds a project's full folder path, only its last segment (${name})`, async () => {
    const { log, env } = retroSetup(PROPOSE_EVENTS);
    const run = await propose([...args, "--log", log], { env, replies: REPLIES, answer: "n" });
    assert.equal(run.requests.length, 2, `flight propose should send 2 requests\n${showP(run)}`);
    for (const [i, request] of run.requests.entries()) {
      for (const path of [ALPHA_PATH, BETA_PATH, GAMMA_PATH, ALPHA_TWIN_PATH, DELTA_PATH, "/Users/someone"]) {
        assert.ok(!request.body.includes(path), `request ${String(i + 1)} to the model holds the path ${path}`);
      }
    }
    // The proposal's request holds the events its causes cite: rich-change's (alpha-shop) and a note of beta-site.
    const second = run.requests[1]!.body;
    assert.ok(second.includes("alpha-shop"), "the proposal's request does not name alpha-shop by its last segment");
    assert.ok(second.includes("beta-site"), "the proposal's request does not name beta-site by its last segment");
  });
}
