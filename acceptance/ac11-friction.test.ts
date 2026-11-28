// AC11: every friction note from the start of the range to the end of the log is printed exactly once, as a
// list item with its note on one line and its id: under the covered change of the same project value whose
// latest event at or before the note is the latest, or else under `## Other friction notes`, after the changes.

import { test } from "node:test";
import assert from "node:assert/strict";

import { notEnoughData } from "./fixtures/replies.ts";
import { DETAIL, DETAIL_EVENTS, DETAIL_HEADINGS, NOTES, heading, note, type NoteLabel } from "./fixtures/retro.ts";
import { OTHER, changeHeadings, occurrences, retro, retroSetup, sections } from "./retro-support.ts";
import { show, type Run } from "./support.ts";

const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+/;

type Placement = Record<string, readonly NoteLabel[]>;

/** Where each note goes when the range starts at rich-change's first event, 2026-11-02 09:00. */
const DEFAULT_PLACEMENT: Placement = {
  [heading(DETAIL.y)]: ["f5"],
  [heading(DETAIL.x)]: ["f9", "fx", "f1", "multi"],
  [heading(DETAIL.w)]: ["f4", "f3", "f2", "end"],
  [OTHER]: ["f8", "f6", "f7", "ft"],
};

async function run(args: string[]): Promise<Run> {
  const { log, env } = retroSetup(DETAIL_EVENTS);
  const result = await retro([...args, "--log", log], { env, replies: [notEnoughData("more accepted changes")] });
  assert.deepEqual(changeHeadings(result.stdout), DETAIL_HEADINGS, `the detail log's 3 accepted changes should have sections\n${show(result)}`);
  return result;
}

/** The note text as it should read on its one line. */
const oneLine = (text: string): string[] => text.split("\n").map((part) => part.trim());

function assertPlacement(result: Run, placement: Placement, absent: readonly NoteLabel[]): void {
  const all = sections(result.stdout);
  for (const [where, labels] of Object.entries(placement)) {
    const found = all.filter((s) => s.heading === where);
    assert.equal(found.length, 1, `stdout should have exactly one section "## ${where}"\n${show(result)}`);
    for (const label of labels) {
      const id = note(label);
      assert.equal(occurrences(result.stdout, id), 1, `note ${label} (${id}) should be printed exactly once\n${show(result)}`);
      const line = found[0]!.lines.find((l) => l.includes(id));
      assert.ok(line, `note ${label} (${id}) should be under "## ${where}"\n${show(result)}`);
      assert.match(line, LIST_ITEM, `note ${label} should be a list item: ${line}`);
      for (const part of oneLine(NOTES[label])) {
        assert.ok(line.includes(part), `note ${label}'s line should hold "${part}", on one line with its id: ${line}`);
      }
    }
  }
  for (const label of absent) {
    assert.equal(occurrences(result.stdout, note(label)), 0, `note ${label} is outside the range and should not be printed\n${show(result)}`);
    assert.ok(!result.stdout.includes(NOTES[label]), `note ${label}'s text is printed\n${show(result)}`);
  }
}

function assertOtherAfterChanges(result: Run): void {
  const headings = sections(result.stdout).map((s) => s.heading);
  const other = headings.indexOf(OTHER);
  const lastChange = Math.max(...DETAIL_HEADINGS.map((h) => headings.indexOf(h)));
  assert.ok(other > lastChange, `"## ${OTHER}" should come after the change sections\n${show(result)}`);
}

test("AC11 each note in the range is under the covered change of its project whose latest event at or before it is the latest", async () => {
  const result = await run([]);
  const { [OTHER]: _other, ...changes } = DEFAULT_PLACEMENT;
  assertPlacement(result, changes, []);
});

test("AC11 notes with no project, another folder's project or no covered change active yet go under '## Other friction notes', after the changes", async () => {
  const result = await run([]);
  assertPlacement(result, { [OTHER]: DEFAULT_PLACEMENT[OTHER]! }, []);
  assertOtherAfterChanges(result);
});

test("AC11 a note before the range's start is not printed, and a note after every covered change is", async () => {
  const result = await run([]);
  assertPlacement(result, { [heading(DETAIL.w)]: ["end"] }, ["f0"]);
});

test("AC11 a note's newline becomes part of one line holding the note and its id", async () => {
  const result = await run([]);
  assertPlacement(result, { [heading(DETAIL.x)]: ["multi"] }, []);
});

test("AC11 with --since, the range starts at that day: earlier notes are left out, even within a covered change", async () => {
  const result = await run(["--since", "2026-11-03"]);
  assertPlacement(
    result,
    {
      [heading(DETAIL.y)]: ["f5"],
      [heading(DETAIL.x)]: ["fx", "f1", "multi"],
      [heading(DETAIL.w)]: ["f4", "f3", "f2", "end"],
      [OTHER]: ["f6", "f7", "ft"],
    },
    ["f0", "f9", "f8"],
  );
});

test("AC11 with --since before every covered change, a note between that day and the changes goes under '## Other friction notes'", async () => {
  const result = await run(["--since", "2026-11-01"]);
  assertPlacement(result, { ...DEFAULT_PLACEMENT, [OTHER]: [...DEFAULT_PLACEMENT[OTHER]!, "f0"] }, []);
  assertOtherAfterChanges(result);
});
