// AC26 (existing): `flight retro` still sends exactly one request, offering no tools, asks no question and runs
// no command; on AC12's log and reply it still prints the same 4 causes, with the same text and counts in the
// same order. It is given an answer of `y` and a command runner, so asking or running anything would show.

import { test } from "node:test";
import assert from "node:assert/strict";

import { DETAIL_EVENTS } from "./fixtures/retro.ts";
import { PRINTED_CAUSES, RETRO_REPLY } from "./fixtures/propose.ts";
import { CAUSES, listItems, offersNoTools, retroSetup, sectionOf } from "./retro-support.ts";
import { assertNothingOffered, flightWith, showP } from "./propose-support.ts";

async function retroRun() {
  const { log, env } = retroSetup(DETAIL_EVENTS);
  return flightWith(["retro", "--log", log], { env, replies: [RETRO_REPLY], answer: "y" });
}

test("AC26 flight retro still sends exactly one request, offering no tools, asks no question and runs no command", async () => {
  const run = await retroRun();
  assert.equal(run.code, 0, showP(run));
  assert.equal(run.requests.length, 1, `flight retro should send exactly one request\n${showP(run)}`);
  assert.ok(offersNoTools(run.requests[0]!), "the retro's request offers tools");
  assertNothingOffered(run);
});

test("AC26 on AC12's log and reply flight retro still prints the same 4 causes, with the same text and counts in the same order", async () => {
  const run = await retroRun();
  const items = listItems(sectionOf(run, CAUSES));
  assert.equal(items.length, PRINTED_CAUSES.length, `"## ${CAUSES}" should list 4 causes\n${showP(run)}`);
  for (const [i, [cause, counts]] of PRINTED_CAUSES.entries()) {
    const item = items[i]!;
    assert.ok(item.startsWith(`${cause.text} ${counts}`), `cause ${String(i + 1)} should be "${cause.text} ${counts}...": ${item}`);
    for (const id of new Set(cause.cites)) assert.ok(item.includes(id), `cause ${String(i + 1)} should list ${id}: ${item}`);
  }
});
