// AC9: each change's section has a `Stop | Event | Your answer | Event | Waited` table, one row per
// decision (but `merged`) or verdict of its delivery, in time order: the stop is the latest escalation since
// the previous answer, or else the last command before the answer; Waited is whole minutes from the stop.

import { test } from "node:test";
import assert from "node:assert/strict";

import { notEnoughData } from "./fixtures/replies.ts";
import { DETAIL, DETAIL_EVENTS, DETAIL_HEADINGS, ev, heading } from "./fixtures/retro.ts";
import { TABLE_HEADER, changeHeadings, retro, retroSetup, sectionOf, tableRows } from "./retro-support.ts";
import { show, type Run } from "./support.ts";

async function detailRetro(): Promise<Run> {
  const { log, env } = retroSetup(DETAIL_EVENTS);
  const run = await retro(["--log", log], { env, replies: [notEnoughData("more accepted changes")] });
  assert.deepEqual(changeHeadings(run.stdout), DETAIL_HEADINGS, `the detail log's 3 accepted changes should have sections\n${show(run)}`);
  return run;
}

function rowsOf(run: Run, d: { change: string; project: string }): string[][] {
  const section = sectionOf(run, heading(d));
  const rows = tableRows(section);
  assert.ok(rows, `the section "${heading(d)}" has no table with the columns ${TABLE_HEADER.join(" | ")}\n${show(run)}`);
  return rows;
}

test("AC9 rich-change's table has one row per decision, in time order, with its stops, ids and waits", async () => {
  const run = await detailRetro();
  assert.deepEqual(rowsOf(run, DETAIL.x), [
    ["design ended: succeeded", ev("x", "c1"), "approved", ev("x", "a1"), "48 min"],
    // Two escalations since the previous answer: the latest is the stop.
    ["escalated: build attempts (3)", ev("x", "s1"), "sent back", ev("x", "a2"), "21 h 16 min"],
    ["escalated: rules (1)", ev("x", "s2"), "allowed past review", ev("x", "a3"), "8 min"],
    ["build ended: succeeded", ev("x", "c4"), "accepted", ev("x", "a4"), "27 h 1 min"],
    // A release after the acceptance is still a row; the last command before it is still c4.
    ["build ended: succeeded", ev("x", "c4"), "released", ev("x", "a5"), "27 h 30 min"],
  ]);
});

test("AC9 the earlier, never accepted delivery of the same change adds no row and no stop", async () => {
  const run = await detailRetro();
  const rows = rowsOf(run, DETAIL.x);
  const ids = rows.flatMap((r) => [r[1], r[3]]);
  for (const name of ["rules", "build", "send-back"]) {
    assert.ok(!ids.includes(ev("z", name)), `rich-change's table holds ${ev("z", name)}, from another delivery\n${show(run)}`);
  }
  assert.equal(rows[0]?.[0], "design ended: succeeded", `the first answer's stop should be its own delivery's design command\n${show(run)}`);
});

test("AC9 a merged decision gets no row, and a judged verdict is a row; minutes are rounded down", async () => {
  const run = await detailRetro();
  assert.deepEqual(rowsOf(run, DETAIL.y), [
    // 5 minutes 59 seconds.
    ["design ended: succeeded", ev("y", "c1"), "approved", ev("y", "a1"), "5 min"],
    ["escalated: frozen tests (1)", ev("y", "s1"), "corrected tests", ev("y", "a2"), "45 min"],
    ["build ended: succeeded", ev("y", "c3"), "problems", ev("y", "judge"), "18 h 0 min"],
    ["build ended: succeeded", ev("y", "c3"), "accepted", ev("y", "a3"), "19 h 1 min"],
  ]);
  assert.ok(!run.stdout.includes(ev("y", "merge")), `the merged decision ${ev("y", "merge")} is printed\n${show(run)}`);
});

test("AC9 small-fix's table: a wait of exactly 2 hours is '2 h 0 min'", async () => {
  const run = await detailRetro();
  assert.deepEqual(rowsOf(run, DETAIL.w), [
    ["design ended: succeeded", ev("w", "c1"), "approved", ev("w", "a1"), "30 min"],
    ["build ended: succeeded", ev("w", "c2"), "accepted", ev("w", "a2"), "2 h 0 min"],
  ]);
});
