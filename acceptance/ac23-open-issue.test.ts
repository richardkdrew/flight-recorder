// AC23: on `y` or `yes`, `flight propose` runs exactly one command, `gh` with the arguments
// `issue create --repo richardkdrew/agentic-orc-factory --title <title> --body-file -`, the title on one line with
// control characters removed, and standard input exactly the proposal's section as printed, without its heading
// line and the blank lines around it; when `gh` exits 0 it prints `opened: ` and the first line of gh's stdout on
// stdout and exits 0; when `gh` is not found or exits non-zero it says `stopped: could not open the issue: ` and
// why on stderr, and exits 1. The 60-second limit on `gh` is in ac23-gh-timeout.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";

import { DETAIL_EVENTS } from "./fixtures/retro.ts";
import { GOOD, RETRO_REPLY, proposalReply, type Proposal } from "./fixtures/propose.ts";
import { retroSetup } from "./retro-support.ts";
import { lines } from "./support.ts";
import {
  FACTORY_REPO,
  ISSUE_URL,
  issueBody,
  propose,
  showP,
  type Gh,
  type ProposeRun,
} from "./propose-support.ts";

async function proposeYes(p: Proposal, gh?: Gh, answer = "y"): Promise<ProposeRun> {
  const { log, env } = retroSetup(DETAIL_EVENTS);
  return propose(["--log", log], { env, replies: [RETRO_REPLY, proposalReply(p)], answer, ...(gh ? { gh } : {}) });
}

const args = (title: string): string[] => ["issue", "create", "--repo", FACTORY_REPO, "--title", title, "--body-file", "-"];

function assertBody(run: ProposeRun): void {
  assert.equal(run.answers.length, 1, showP(run));
  const expected = issueBody(run.answers[0]!.stdout, run);
  const input = run.runs[0]!.input;
  assert.ok(
    input === expected || input === `${expected}\n`,
    `gh's standard input should be the proposal's section as printed, without its heading and surrounding blank lines\n--- expected ---\n${expected}\n--- got ---\n${input}`,
  );
  assert.ok(input.includes(`The problem: ${GOOD.problem}`) && input.includes(`The change: ${GOOD.change}`), `the body lacks the problem or the change:\n${input}`);
  assert.ok(!input.includes("## Proposal"), `the body holds the heading line:\n${input}`);
}

for (const answer of ["y", "yes"]) {
  test(`AC23 on '${answer}' it runs exactly one command: gh issue create --repo ${FACTORY_REPO} --title <title> --body-file -`, async () => {
    const run = await proposeYes(GOOD, undefined, answer);
    assert.equal(run.runs.length, 1, `exactly one command should run\n${showP(run)}`);
    assert.equal(run.runs[0]!.file, "gh", showP(run));
    assert.deepEqual(run.runs[0]!.args, args(GOOD.title), showP(run));
  });
}

test("AC23 gh's standard input is exactly the proposal's section as printed, without its heading line and the blank lines around it", async () => {
  const run = await proposeYes(GOOD);
  assert.equal(run.runs.length, 1, showP(run));
  assertBody(run);
});

test("AC23 the issue's title is the proposal's title on one line with control characters removed", async () => {
  const p: Proposal = { ...GOOD, title: "Tell the\u0007 owner\nwhen a run\u001b stops" };
  const run = await proposeYes(p);
  assert.equal(run.runs.length, 1, showP(run));
  assert.deepEqual(run.runs[0]!.args, args("Tell the owner when a run stops"), showP(run));
  assertBody(run);
});

test("AC23 when gh exits 0 it prints 'opened: ' and the first line gh wrote to its stdout, on stdout, and exits 0", async () => {
  const run = await proposeYes(GOOD);
  assert.equal(run.code, 0, showP(run));
  assert.ok(lines(run.stdout).includes(`opened: ${ISSUE_URL}`), `stdout should have the line "opened: ${ISSUE_URL}"\n${showP(run)}`);
  assert.ok(!run.stdout.includes("second line of gh output"), `only gh's first line should be printed\n${showP(run)}`);
});

for (const [name, gh] of [
  ["gh is not found", { kind: "not_found" }],
  ["gh exits 1", { kind: "exited", code: 1, stdout: "", stderr: "HTTP 404: Not Found (https://api.github.com/repos)\n" }],
  ["gh exits 4", { kind: "exited", code: 4, stdout: "", stderr: "To get started with GitHub CLI, please run:  gh auth login\n" }],
] as const) {
  test(`AC23 when ${name} it says 'stopped: could not open the issue: ' and why on stderr, and exits 1`, async () => {
    const run = await proposeYes(GOOD, gh);
    assert.equal(run.runs.length, 1, showP(run));
    assert.equal(run.code, 1, showP(run));
    const line = lines(run.stderr).find((l) => l.includes("stopped: could not open the issue: "));
    assert.ok(line, `stderr should say "stopped: could not open the issue: " and why\n${showP(run)}`);
    const why = line.slice(line.indexOf("stopped: could not open the issue: ") + "stopped: could not open the issue: ".length);
    assert.ok(why.trim().length > 0, `stderr should say why the issue could not be opened: ${line}`);
    assert.ok(!run.stdout.includes("opened: "), `stdout says it opened the issue\n${showP(run)}`);
  });
}
