// AC12: with 2 or more changes covered, `flight retro` sends exactly one request, offering no tools; when the
// reply passes the citation check the output ends with `## Causes that repeat` (only causes whose ids belong
// to 2 or more covered changes, each with `(<n> changes, <m> events)` as the code counts them and every id it
// cites, ordered by n then m, largest first), then `## What went well`, each item with its ids; exit 0.

import { test } from "node:test";
import assert from "node:assert/strict";

import { retroReply, type RetroItem } from "./fixtures/replies.ts";
import { DETAIL, DETAIL_EVENTS, DETAIL_HEADINGS, ev, note } from "./fixtures/retro.ts";
import {
  CAUSES,
  OTHER,
  WENT_WELL,
  changeHeadings,
  listItems,
  offersNoTools,
  retro,
  retroSetup,
  sectionOf,
  sections,
} from "./retro-support.ts";
import { show, type Run } from "./support.ts";

// Covered: plain-change (y), rich-change (x), small-fix (w).
const CAUSE_A: RetroItem = {
  // x, x, and a note printed under plain-change: 2 changes, 3 events.
  text: "AC12-CAUSE-A: escalations stopped the build and waited on the owner",
  cites: [ev("x", "s1"), ev("x", "s2"), note("f5")],
};
const CAUSE_DROPPED: RetroItem = {
  // A note under Other friction notes counts for no change, and f3 is printed under small-fix: 1 change.
  text: "AC12-CAUSE-DROPPED: notes about small-fix only",
  cites: [note("f6"), note("f3"), ev("w", "a2")],
};
const CAUSE_F: RetroItem = {
  // A note printed under rich-change and a small-fix event: 2 changes, 2 events.
  text: "AC12-CAUSE-F: acceptance waited for the owner's morning",
  cites: [note("f1"), ev("w", "a2")],
};
const CAUSE_B: RetroItem = {
  // rich-change's delivery id (not an event), a small-fix event and a plain-change event: 3 changes, 2 events.
  text: "AC12-CAUSE-B: every change needed more than one build",
  cites: [DETAIL.x.id, ev("w", "eng1"), ev("y", "s1")],
};
const CAUSE_D: RetroItem = {
  // One id cited twice counts once: 2 changes, 4 events.
  text: "AC12-CAUSE-D: commands ended long before the owner answered",
  cites: [ev("x", "c2"), ev("w", "c1"), ev("w", "a1"), ev("w", "c2"), ev("w", "c2")],
};
const WELL_1: RetroItem = {
  text: "AC12-WELL-1: the small changes were accepted on their first preview",
  cites: [ev("y", "a3"), ev("w", "a2")],
};
const WELL_2: RetroItem = { text: "AC12-WELL-2: rich-change shipped despite its stops", cites: [DETAIL.x.id] };

/** The causes as they should be printed, in order, with the counts the code works out. */
const EXPECTED_CAUSES: [RetroItem, string][] = [
  [CAUSE_B, "(3 changes, 2 events)"],
  [CAUSE_D, "(2 changes, 4 events)"],
  [CAUSE_A, "(2 changes, 3 events)"],
  [CAUSE_F, "(2 changes, 2 events)"],
];

async function causesRetro(): Promise<Run> {
  const { log, env } = retroSetup(DETAIL_EVENTS);
  const run = await retro(["--log", log], {
    env,
    replies: [retroReply([CAUSE_A, CAUSE_DROPPED, CAUSE_F, CAUSE_B, CAUSE_D], [WELL_1, WELL_2])],
  });
  assert.deepEqual(changeHeadings(run.stdout), DETAIL_HEADINGS, `the detail log's 3 accepted changes should have sections\n${show(run)}`);
  return run;
}

test("AC12 a retro of 2 or more changes sends exactly one request to the model, offering no tools, and exits 0", async () => {
  const run = await causesRetro();
  assert.equal(run.code, 0, show(run));
  assert.equal(run.requests.length, 1, `the retro should send exactly one request\n${show(run)}`);
  assert.ok(offersNoTools(run.requests[0]!), `the request offers tools: ${JSON.stringify((JSON.parse(run.requests[0]!.body) as { tools?: unknown }).tools)}`);
});

test("AC12 the output ends with '## Causes that repeat' and then '## What went well', after the changes and other notes", async () => {
  const run = await causesRetro();
  const headings = sections(run.stdout).map((s) => s.heading);
  assert.deepEqual(headings.slice(-2), [CAUSES, WENT_WELL], `the last two sections should be causes, then what went well\n${show(run)}`);
  assert.ok(headings.indexOf(OTHER) < headings.indexOf(CAUSES), `"## ${OTHER}" should come before "## ${CAUSES}"\n${show(run)}`);
  for (const h of DETAIL_HEADINGS) {
    assert.ok(headings.indexOf(h) < headings.indexOf(CAUSES), `"## ${h}" should come before "## ${CAUSES}"\n${show(run)}`);
  }
});

test("AC12 each cause is followed by (<n> changes, <m> events) as the code counts them and by every id it cites, largest n then m first", async () => {
  const run = await causesRetro();
  const items = listItems(sectionOf(run, CAUSES));
  const found = EXPECTED_CAUSES.map(([cause]) => items.findIndex((item) => item.includes(cause.text)));
  for (const [i, [cause, counts]] of EXPECTED_CAUSES.entries()) {
    assert.ok(found[i]! >= 0, `the cause "${cause.text}" is not a list item under "## ${CAUSES}"\n${show(run)}`);
    const item = items[found[i]!]!;
    assert.ok(item.includes(counts), `the cause "${cause.text}" should be followed by ${counts}: ${item}`);
    assert.ok(item.indexOf(counts) > item.indexOf(cause.text), `${counts} should follow the cause's text: ${item}`);
    for (const id of new Set(cause.cites)) assert.ok(item.includes(id), `the cause "${cause.text}" should list ${id}: ${item}`);
  }
  assert.deepEqual(
    [...found].sort((a, b) => a - b),
    found,
    `the causes should be ordered by changes, then events, largest first\n${show(run)}`,
  );
});

test("AC12 a cause whose ids belong to fewer than 2 covered changes is not printed", async () => {
  const run = await causesRetro();
  assert.ok(sections(run.stdout).some((s) => s.heading === CAUSES), `stdout has no "## ${CAUSES}"\n${show(run)}`);
  assert.ok(!run.stdout.includes(CAUSE_DROPPED.text), `the single-change cause was printed\n${show(run)}`);
  assert.equal(listItems(sectionOf(run, CAUSES)).length, EXPECTED_CAUSES.length, `"## ${CAUSES}" should list 4 causes\n${show(run)}`);
});

test("AC12 each item of '## What went well' is printed with the ids it cites", async () => {
  const run = await causesRetro();
  const items = listItems(sectionOf(run, WENT_WELL));
  for (const well of [WELL_1, WELL_2]) {
    const item = items.find((i) => i.includes(well.text));
    assert.ok(item, `"${well.text}" is not a list item under "## ${WENT_WELL}"\n${show(run)}`);
    for (const id of well.cites) assert.ok(item.includes(id), `"${well.text}" should list ${id}: ${item}`);
  }
});
