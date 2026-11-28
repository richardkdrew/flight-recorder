// AC18: with 2 or more changes covered and at least one cause printed, `flight propose` (taking --since and --log
// as `flight retro` does) prints exactly what `flight retro` prints for the same log and first reply, then sends
// exactly one more request, offering no tools, and when its reply passes the checks prints `## Proposal: <title>`,
// `The problem: <problem>`, `The change: <change>` and `Rests on (<n> changes, <m> events): ` with every id it
// cites, n and m counted by the code as for a cause; 2 requests in all.

import { test } from "node:test";
import assert from "node:assert/strict";

import { DETAIL, DETAIL_EVENTS, ev, note } from "./fixtures/retro.ts";
import {
  GOOD,
  GOOD_COUNTS,
  PROPOSE_EVENTS,
  RETRO_REPLY,
  SINCE,
  proposalReply,
  type Proposal,
} from "./fixtures/propose.ts";
import { changeHeadings, offersNoTools } from "./retro-support.ts";
import {
  assertStartsWithRetro,
  propose,
  proposalSection,
  showP,
  withRetro,
  type ProposeRun,
} from "./propose-support.ts";

async function proposeOn(p: Proposal, args: string[] = [], events = DETAIL_EVENTS) {
  const { log, env, retroRun } = await withRetro(events, args, [RETRO_REPLY]);
  const run = await propose([...args, "--log", log], { env, replies: [RETRO_REPLY, proposalReply(p)], answer: "n" });
  return { run, retroRun };
}

/** The lines of the proposal's section that are not blank. */
function sectionLines(run: ProposeRun): string[] {
  const section = proposalSection(run.stdout, run);
  return [section.heading, ...section.lines.filter((l) => l.trim() !== "")];
}

function assertProposal(run: ProposeRun, p: Proposal, counts: string): void {
  const got = sectionLines(run);
  assert.equal(got[0], `## Proposal: ${p.title}`, showP(run));
  const problem = got.indexOf(`The problem: ${p.problem}`);
  const change = got.indexOf(`The change: ${p.change}`);
  const restsOn = got.findIndex((l) => l.startsWith("Rests on ("));
  assert.ok(problem > 0, `no line "The problem: ${p.problem}" in the proposal\n${showP(run)}`);
  assert.ok(change > problem, `"The change: ${p.change}" should follow the problem\n${showP(run)}`);
  assert.ok(restsOn > change, `a "Rests on (" line should follow the change\n${showP(run)}`);
  const line = got[restsOn]!;
  const prefix = `Rests on ${counts}: `;
  assert.ok(line.startsWith(prefix), `the line should start "${prefix}": ${line}`);
  for (const id of new Set(p.cites)) {
    assert.ok(line.slice(prefix.length).includes(id), `the "Rests on" line should list ${id} in full: ${line}`);
  }
}

test("AC18 flight propose prints exactly what flight retro prints for the same log and first reply, then the proposal", async () => {
  const { run, retroRun } = await proposeOn(GOOD);
  assertStartsWithRetro(run, retroRun);
  const rest = run.stdout.slice(retroRun.stdout.length);
  assert.ok(rest.trimStart().startsWith(`## Proposal: ${GOOD.title}`), `the proposal should follow the retro\n${showP(run)}`);
});

test("AC18 flight propose sends 2 requests in all, the second offering no tools", async () => {
  const { run } = await proposeOn(GOOD);
  assert.equal(run.requests.length, 2, `flight propose should send exactly 2 requests\n${showP(run)}`);
  assert.ok(offersNoTools(run.requests[0]!), "the retro's request offers tools");
  assert.ok(offersNoTools(run.requests[1]!), `the proposal's request offers tools: ${run.requests[1]!.body.slice(0, 500)}`);
});

test("AC18 the proposal prints its title, problem, change and 'Rests on (<n> changes, <m> events): ' with every id it cites", async () => {
  const { run } = await proposeOn(GOOD);
  assertProposal(run, GOOD, GOOD_COUNTS);
});

for (const [name, p, counts] of [
  [
    "three commands of two changes",
    { ...GOOD, cites: [ev("x", "c2"), ev("w", "c1"), ev("w", "c2")] },
    "(2 changes, 3 events)",
  ],
  [
    "one event of one change",
    { ...GOOD, cites: [ev("w", "c2")] },
    "(1 change, 1 event)",
  ],
  [
    "a delivery id, which is no event, and a note printed under rich-change",
    { ...GOOD, cites: [DETAIL.x.id, note("f1")] },
    "(1 change, 1 event)",
  ],
] as const) {
  test(`AC18 the code counts the proposal's changes and events from its ids: ${name} is ${counts}`, async () => {
    const { run } = await proposeOn(p);
    assertProposal(run, p, counts);
  });
}

test("AC18 flight propose --since --log prints what flight retro --since --log prints, then the proposal", async () => {
  const { run, retroRun } = await proposeOn(GOOD, ["--since", SINCE], PROPOSE_EVENTS);
  assert.equal(changeHeadings(retroRun.stdout).length, 3, `flight retro --since ${SINCE} should cover 3 changes`);
  assertStartsWithRetro(run, retroRun);
  assert.equal(run.requests.length, 2, showP(run));
  assertProposal(run, GOOD, GOOD_COUNTS);
});
