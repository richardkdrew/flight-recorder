// AC20: before printing a proposal, `flight propose` withholds it (no `## Proposal`, no question, no command,
// exit 1) when its title, problem or change holds, checked in this order with the first found reported on stderr:
// a covered change's name as a whole word in any case (`it names <name>`); the last path segment of any project
// in the log, covered or not (`it holds private detail: the project <segment>`); a filesystem path (`it holds
// private detail: a path`); or an email address (`it holds private detail: an email address`). A `/` inside a
// word, such as `and/or`, is not a path.
//
// The log is the detail log and an older delta-tools delivery, run with --since 2026-11-01: covered are
// plain-change (beta-site), rich-change and small-fix (alpha-shop); gamma-app has only a friction note, and
// delta-tools has events only before --since.

import { test } from "node:test";
import assert from "node:assert/strict";

import { GOOD, PROPOSE_EVENTS, RETRO_REPLY, SINCE, proposalReply, type Proposal } from "./fixtures/propose.ts";
import {
  assertNothingOffered,
  assertStartsWithRetro,
  propose,
  proposalSection,
  showP,
  stderrFrom,
  withRetro,
} from "./propose-support.ts";

const ARGS = ["--since", SINCE];

async function proposeWith(p: Proposal) {
  const { log, env, retroRun } = await withRetro(PROPOSE_EVENTS, ARGS, [RETRO_REPLY]);
  const run = await propose([...ARGS, "--log", log], { env, replies: [RETRO_REPLY, proposalReply(p)] });
  return { run, retroRun };
}

type Field = "title" | "problem" | "change";
const NAMES = "proposal withheld: it names ";
const PROJECT = "proposal withheld: it holds private detail: the project ";
const PATH = "proposal withheld: it holds private detail: a path";
const EMAIL = "proposal withheld: it holds private detail: an email address";

const CASES: [string, Field, string, string][] = [
  // A covered change's name, as a whole word, in any case.
  ["a covered change's name in capitals", "title", "Stop RICH-CHANGE from waiting", `${NAMES}rich-change`],
  ["a covered change's name in mixed case, before an apostrophe", "problem", "Small-Fix's spec waited a day on the owner.", `${NAMES}small-fix`],
  ["a covered change's name at the end of a sentence", "change", "Notify the owner sooner, as plain-change needed.", `${NAMES}plain-change`],
  // The last path segment of any project in the log.
  ["a covered project's segment in mixed case", "change", "Warn the owner of Beta-Site builds that stop.", `${PROJECT}beta-site`],
  ["a covered project's segment in lower case", "title", "Notify alpha-shop owners of stops", `${PROJECT}alpha-shop`],
  ["the segment of a project with only a friction note", "problem", "GAMMA-APP had nothing running yet.", `${PROJECT}gamma-app`],
  ["the segment of a project with events only before --since", "problem", "The delta-tools runs stopped too.", `${PROJECT}delta-tools`],
  // A filesystem path.
  ["a path starting / at the start of the field", "title", "/tmp holds the notes for every stop", PATH],
  ["a path starting / after a space", "change", "Have orc write each stop to /var/log for the owner.", PATH],
  ["a path starting ~/ at the start of the field", "problem", "~/notes held what the owner needed.", PATH],
  ["a path starting ~/ after a space", "title", "Keep stops in ~/stops for the owner", PATH],
  ["a path starting ./ after a space", "change", "Have orc run ./notify when a run stops.", PATH],
  ["a path starting ./ at the start of the field", "change", "./notify should run when a run stops.", PATH],
  ["a path after (", "problem", "The notes (/etc/orc) were not read.", PATH],
  ["a path after [", "change", "Read the notes [~/orc] before each run.", PATH],
  ['a path after "', "problem", 'The owner kept "./stops" open all day.', PATH],
  ["a path after '", "title", "Read the notes in '/opt' first", PATH],
  ["a path after a backtick", "change", "Have orc run `./notify` when a run stops.", PATH],
  ["a path starting / followed by a digit", "change", "Keep each stop under /2026 for the owner.", PATH],
  ["a path starting / followed by .", "problem", "The owner read /.config before each run.", PATH],
  ["a path starting / followed by -", "title", "Keep stops in /-stops for the owner", PATH],
  ["a path starting / followed by _", "change", "Keep stops in /_stops for the owner.", PATH],
  ["/Users/ inside a word", "problem", "The notes sat in someplace/Users/owner on the Mac.", PATH],
  ["/private/ inside a word", "change", "Clear tmp/private/var before each run.", PATH],
  ["/home/ inside a word", "title", "Read the notes in srv/home/stops", PATH],
  // An email address.
  ["an email address", "change", "Have orc mail owner.name+orc@mail.example.org when a run stops.", EMAIL],
  ["an email address in the title", "title", "Mail ops-team@example.co when a run stops", EMAIL],
];

for (const [name, field, text, expected] of CASES) {
  test(`AC20 a proposal holding ${name} (in its ${field}) is withheld: '${expected}', exit 1`, async () => {
    const p: Proposal = { ...GOOD, [field]: text };
    const { run, retroRun } = await proposeWith(p);
    assert.equal(run.code, 1, showP(run));
    assertStartsWithRetro(run, retroRun);
    assertNothingOffered(run);
    assert.equal(stderrFrom(run, "proposal withheld: "), expected, showP(run));
    assert.ok(!run.stdout.includes(text), `the proposal's ${field} was printed\n${showP(run)}`);
  });
}

for (const [name, p, expected] of [
  [
    "a path in its title and a covered change's name in its change reports the name",
    { ...GOOD, title: "Keep stops in ~/stops for the owner", change: "Notify the owner sooner, as small-fix needed." },
    `${NAMES}small-fix`,
  ],
  [
    "an email address in its title and a project's segment in its change reports the project",
    { ...GOOD, title: "Mail ops-team@example.co when a run stops", change: "Warn the owner of beta-site builds that stop." },
    `${PROJECT}beta-site`,
  ],
  [
    "an email address in its title and a path in its problem reports the path",
    { ...GOOD, title: "Mail ops-team@example.co when a run stops", problem: "The owner kept /var/stops open all day." },
    PATH,
  ],
  [
    "a project's segment in its title and a covered change's name in its problem reports the name",
    { ...GOOD, title: "Notify alpha-shop owners of stops", problem: "Plain-Change waited a day on the owner." },
    `${NAMES}plain-change`,
  ],
] as const) {
  test(`AC20 checks in order: a proposal with ${name}`, async () => {
    const { run } = await proposeWith(p);
    assert.equal(run.code, 1, showP(run));
    assertNothingOffered(run);
    assert.equal(stderrFrom(run, "proposal withheld: "), expected, showP(run));
  });
}

test("AC20 a proposal with / inside words (and/or), and names only as parts of longer words, is printed", async () => {
  const p: Proposal = {
    title: "Notify the owner and/or the reviewer when a run stops",
    problem: "Small-fixes and beta-sites alike waited, and packages/core/prompts/retro.md says nothing of it.",
    change: "Have orc send a notification and/or an email when a run stops for the owner.",
    cites: GOOD.cites,
  };
  const { run, retroRun } = await proposeWith(p);
  assertStartsWithRetro(run, retroRun);
  assert.ok(!run.stderr.includes("proposal withheld"), `the proposal was withheld\n${showP(run)}`);
  const section = proposalSection(run.stdout, run);
  assert.equal(section.heading, `## Proposal: ${p.title}`, showP(run));
  assert.ok(section.lines.includes(`The problem: ${p.problem}`), `the problem was not printed as written\n${showP(run)}`);
  assert.ok(section.lines.includes(`The change: ${p.change}`), `the change was not printed as written\n${showP(run)}`);
});
