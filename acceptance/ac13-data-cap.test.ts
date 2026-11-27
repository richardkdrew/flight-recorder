// AC13: when the JSON inside `<retro>` (the covered changes' events and the friction notes in the range) would
// be more than 200,000 bytes, no request is sent, the change sections are still printed, stderr says
// `stopped: the retro's data is <n> KB, over the 200 KB limit for one request; choose a later --since` with
// n the bytes divided by 1,000 and rounded up, and it exits 1.
//
// Two logs of 2 accepted changes, the same but for one friction note's length: one whose `<retro>` JSON is
// exactly 200,000 bytes, one whose JSON is 200,001. The note is mostly "é", 2 bytes of UTF-8 each, so the
// cap is on bytes, not characters. A first run on a third copy measures the JSON's size around the note.

import { test } from "node:test";
import assert from "node:assert/strict";

import { notEnoughData } from "./fixtures/replies.ts";
import { ALPHA_PATH, BETA_PATH, byTime, delivery, friction, heading } from "./fixtures/retro.ts";
import type { Event } from "./fixtures/events.ts";
import { CAUSES, WENT_WELL, changeHeadings, retro, retroDataBytes, retroSetup, sections } from "./retro-support.ts";
import { show } from "./support.ts";

const LIMIT = 200_000;

const one = delivery("cap-one", ALPHA_PATH, "cap-one");
const two = delivery("cap-two", BETA_PATH, "cap-two");
const HEADINGS = [heading(one), heading(two)];

function capEvents(noteText: string): Event[] {
  return byTime([
    one.agent("eng", "2026-11-10 09:00", "engineering", "succeeded"),
    one.command("build", "2026-11-10 10:00", "build", "succeeded"),
    one.decided("accept", "2026-11-10 12:00", "accepted"),
    friction("cap-note", "2026-11-11 09:00", ALPHA_PATH, noteText),
    two.agent("eng", "2026-11-12 09:00", "engineering", "succeeded"),
    two.command("build", "2026-11-12 10:00", "build", "succeeded"),
    two.decided("accept", "2026-11-12 12:00", "accepted"),
  ]);
}

const BASE_NOTE = "the cap note: " + "é".repeat(1000);

/** `bytes` more bytes of UTF-8 for the note: "é" where it can, and one "a" for an odd count. */
const padding = (bytes: number): string => "é".repeat(Math.floor(bytes / 2)) + "a".repeat(bytes % 2);

/** The size of the `<retro>` JSON for the log with the base note, from the one request it sends. */
async function measureBase(): Promise<number> {
  const { log, env } = retroSetup(capEvents(BASE_NOTE));
  const run = await retro(["--log", log], { env, replies: [notEnoughData("more accepted changes")] });
  assert.equal(run.requests.length, 1, `a retro of 2 small changes should send one request\n${show(run)}`);
  const bytes = retroDataBytes(run.requests[0]!);
  assert.ok(bytes < LIMIT, `the base log's data is ${bytes} bytes, already over the limit`);
  return bytes;
}

test("AC13 a retro whose <retro> JSON is exactly 200,000 bytes sends exactly one request, holding at most 200,000 bytes", async () => {
  const base = await measureBase();
  const { log, env } = retroSetup(capEvents(BASE_NOTE + padding(LIMIT - base)));
  const run = await retro(["--log", log], { env, replies: [notEnoughData("more accepted changes")] });
  assert.equal(run.requests.length, 1, `exactly one request should be sent\n${show(run).slice(0, 4000)}`);
  const bytes = retroDataBytes(run.requests[0]!);
  assert.ok(bytes <= LIMIT, `the request's <retro> JSON is ${bytes} bytes, over ${LIMIT}`);
  assert.equal(run.code, 0, show(run).slice(0, 4000));
});

test("AC13 a retro whose <retro> JSON would be 200,001 bytes sends no request, prints its sections and 'stopped: the retro's data is 201 KB, ...', exit 1", async () => {
  const base = await measureBase();
  const { log, env } = retroSetup(capEvents(BASE_NOTE + padding(LIMIT + 1 - base)));
  const run = await retro(["--log", log], { env, replies: [notEnoughData("more accepted changes")] });
  const brief = show(run).slice(0, 4000);
  assert.equal(run.requests.length, 0, `no request should reach the model\n${brief}`);
  assert.equal(run.code, 1, brief);
  assert.deepEqual(changeHeadings(run.stdout), HEADINGS, `the change sections should be printed\n${brief}`);
  const headings = sections(run.stdout).map((s) => s.heading);
  assert.ok(!headings.includes(CAUSES) && !headings.includes(WENT_WELL), `causes or what went well were printed\n${brief}`);
  const expected = "stopped: the retro's data is 201 KB, over the 200 KB limit for one request; choose a later --since";
  assert.ok(run.stderr.includes(expected), `stderr should say "${expected}"\n--- stderr ---\n${run.stderr.slice(0, 2000)}`);
});

test("AC13 the data cap's <n> KB is the data's bytes divided by 1,000 and rounded up", async () => {
  const base = await measureBase();
  // 234,567 bytes: 235 KB.
  const { log, env } = retroSetup(capEvents(BASE_NOTE + padding(234_567 - base)));
  const run = await retro(["--log", log], { env, replies: [notEnoughData("more accepted changes")] });
  const brief = show(run).slice(0, 4000);
  assert.equal(run.requests.length, 0, `no request should reach the model\n${brief}`);
  assert.equal(run.code, 1, brief);
  const expected = "stopped: the retro's data is 235 KB, over the 200 KB limit for one request; choose a later --since";
  assert.ok(run.stderr.includes(expected), `stderr should say "${expected}"\n--- stderr ---\n${run.stderr.slice(0, 2000)}`);
});
