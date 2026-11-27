// AC13: when a cause or a went-well item cites nothing or an id that is not in the data the retro sent, when
// the reply is not in the expected form, or when no reply arrives within the timeout, the change sections are
// still printed, neither `## Causes that repeat` nor `## What went well` is, stderr says why, and it exits 1.
// The 120-second default is in ac13-default-timeout.test.ts and the data cap in ac13-data-cap.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";

import { MISSING_ID } from "./fixtures/events.ts";
import { HANG, answer, delayed, rawText, retroReply, type Reply, type RetroItem } from "./fixtures/replies.ts";
import { DETAIL, DETAIL_EVENTS, DETAIL_HEADINGS, ev, note } from "./fixtures/retro.ts";
import { CAUSES, WENT_WELL, changeHeadings, retro, retroSetup, sections } from "./retro-support.ts";
import { lines, show, type Run } from "./support.ts";

const GOOD_CAUSE: RetroItem = {
  text: "AC13-GOOD-CAUSE: escalations waited on the owner",
  cites: [ev("x", "s1"), ev("y", "s1")],
};
const GOOD_WELL: RetroItem = { text: "AC13-GOOD-WELL: small-fix went through first time", cites: [DETAIL.w.id] };

async function detailRetro(replies: Reply[], limits?: Record<string, number>): Promise<Run> {
  const { log, env } = retroSetup(DETAIL_EVENTS);
  return retro(["--log", log], { env, replies, ...(limits ? { limits } : {}) });
}

function assertSectionsOnly(run: Run, texts: string[] = []): void {
  assert.equal(run.code, 1, show(run));
  assert.deepEqual(changeHeadings(run.stdout), DETAIL_HEADINGS, `the change sections should still be printed\n${show(run)}`);
  const headings = sections(run.stdout).map((s) => s.heading);
  assert.ok(!headings.includes(CAUSES), `"## ${CAUSES}" was printed\n${show(run)}`);
  assert.ok(!headings.includes(WENT_WELL), `"## ${WENT_WELL}" was printed\n${show(run)}`);
  for (const text of texts) {
    assert.ok(!run.stdout.includes(text) && !run.stderr.includes(text), `"${text}" was printed\n${show(run)}`);
  }
}

function withheldLine(run: Run): string {
  const line = lines(run.stderr).find((l) => l.includes("causes withheld:"));
  assert.ok(line, `stderr has no "causes withheld:" line\n${show(run)}`);
  return line.slice(line.indexOf("causes withheld:"));
}

for (const [name, bad] of [
  ["an id in no event and no delivery of the log", MISSING_ID],
  ["an event id of a delivery the retro did not cover", ev("z", "rules")],
  ["a friction note from before the range, which the retro did not send", note("f0")],
] as const) {
  test(`AC13 a cause citing ${name} withholds both sections, names the id, exit 1`, async () => {
    const cause: RetroItem = { text: "AC13-BAD-CAUSE: a cause resting on an id that was not sent", cites: [ev("x", "s2"), ev("w", "a2"), bad] };
    const run = await detailRetro([retroReply([GOOD_CAUSE, cause], [GOOD_WELL])]);
    assertSectionsOnly(run, [cause.text, GOOD_CAUSE.text, GOOD_WELL.text]);
    assert.ok(withheldLine(run).includes(bad), `the withheld line should name ${bad}\n${show(run)}`);
    assert.equal(run.requests.length, 1, show(run));
  });
}

test("AC13 a went-well item citing an id that was not sent withholds both sections, exit 1", async () => {
  const well: RetroItem = { text: "AC13-BAD-WELL: praise resting on nothing real", cites: [MISSING_ID] };
  const run = await detailRetro([retroReply([GOOD_CAUSE], [GOOD_WELL, well])]);
  assertSectionsOnly(run, [GOOD_CAUSE.text, GOOD_WELL.text, well.text]);
  assert.ok(withheldLine(run).includes(MISSING_ID), `the withheld line should name ${MISSING_ID}\n${show(run)}`);
});

test("AC13 a cause that cites nothing withholds both sections: 'causes withheld: it cited nothing', exit 1", async () => {
  const cause: RetroItem = { text: "AC13-EMPTY-CAUSE: a cause with no citations", cites: [] };
  const run = await detailRetro([retroReply([cause], [GOOD_WELL])]);
  assertSectionsOnly(run, [cause.text, GOOD_WELL.text]);
  assert.ok(run.stderr.includes("causes withheld: it cited nothing"), `stderr should say "causes withheld: it cited nothing"\n${show(run)}`);
});

test("AC13 a went-well item that cites nothing withholds both sections, exit 1", async () => {
  const well: RetroItem = { text: "AC13-EMPTY-WELL: an item with no citations", cites: [] };
  const run = await detailRetro([retroReply([GOOD_CAUSE], [well])]);
  assertSectionsOnly(run, [GOOD_CAUSE.text, well.text]);
  withheldLine(run);
});

for (const [name, reply] of [
  ["text that is not JSON", rawText("AC13-PROSE: The causes are escalations and slow answers.")],
  ["an ask-style answer", answer("AC13-ASK-FORM: escalations repeat", [ev("x", "s1")])],
  ["a retro reply with no went_well", rawText(JSON.stringify({ kind: "retro", causes: [GOOD_CAUSE] }))],
] as const) {
  test(`AC13 a reply that is ${name} prints 'stopped: the model's reply was not in the expected form', exit 1`, async () => {
    const run = await detailRetro([reply]);
    assertSectionsOnly(run, ["AC13-PROSE", "AC13-ASK-FORM", GOOD_CAUSE.text]);
    assert.ok(
      run.stderr.includes("stopped: the model's reply was not in the expected form"),
      `stderr should say "stopped: the model's reply was not in the expected form"\n${show(run)}`,
    );
  });
}

test("AC13 no reply within the timeout prints 'stopped: no answer within <s> seconds' and the change sections, exit 1", { timeout: 60_000 }, async () => {
  const run = await detailRetro([HANG], { timeoutSeconds: 2 });
  assertSectionsOnly(run);
  assert.ok(run.stderr.includes("stopped: no answer within 2 seconds"), `stderr should say "stopped: no answer within 2 seconds"\n${show(run)}`);
  assert.ok(run.seconds >= 1.8 && run.seconds < 30, `it stopped after ${run.seconds.toFixed(1)} seconds, not about 2`);
});

test("AC13 a valid reply that would arrive after the timeout is not printed, exit 1", { timeout: 60_000 }, async () => {
  const run = await detailRetro([delayed(6_000, retroReply([GOOD_CAUSE], [GOOD_WELL]))], { timeoutSeconds: 2 });
  assertSectionsOnly(run, [GOOD_CAUSE.text, GOOD_WELL.text]);
  assert.ok(run.stderr.includes("stopped: no answer within 2 seconds"), `stderr should say "stopped: no answer within 2 seconds"\n${show(run)}`);
  assert.ok(run.seconds < 5.5, `it waited ${run.seconds.toFixed(1)} seconds, past its 2-second timeout`);
});
