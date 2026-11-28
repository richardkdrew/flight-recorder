// AC16: data/synthetic/events.jsonl holds only the values orc's real log holds, no friction note has a
// delivery, and every event id the file held before this change is still in it with the same type, time,
// project, change and delivery.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { SYNTHETIC_BEFORE } from "./fixtures/synthetic-before.ts";
import { ROOT } from "./support.ts";

type Line = {
  id: string;
  time: string;
  type: string;
  project?: string | null;
  change?: string | null;
  delivery?: string | null;
  data: unknown;
};

function readDataSet(): Line[] {
  return readFileSync(join(ROOT, "data", "synthetic", "events.jsonl"), "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line, i) => {
      try {
        return JSON.parse(line) as Line;
      } catch (cause) {
        throw new Error(`events.jsonl line ${i + 1} is not JSON`, { cause });
      }
    });
}

const dataOf = (line: Line): Record<string, unknown> =>
  (typeof line.data === "string" ? JSON.parse(line.data) : line.data) as Record<string, unknown>;

const ALLOWED: [type: string, field: string, values: string[]][] = [
  [
    "orc.owner.decided.v1",
    "decision",
    ["approved", "answered", "reopened", "allowed", "allowed past review", "sent back", "corrected tests", "accepted", "released", "merged"],
  ],
  ["orc.owner.judged.v1", "verdict", ["works", "problems"]],
  ["orc.run.escalated.v1", "kind", ["build attempts", "rules", "review rounds", "frozen tests"]],
  ["orc.agent.finished.v1", "outcome", ["succeeded", "failed", "timed out"]],
  ["orc.command.finished.v1", "outcome", ["succeeded", "stopped"]],
  ["orc.deploy.finished.v1", "outcome", ["succeeded", "failed"]],
  ["orc.review.recorded.v1", "verdict", ["pass", "changes_requested"]],
];

for (const [type, field, values] of ALLOWED) {
  test(`AC16 every ${type} ${field} in the synthetic data set is one of ${values.map((v) => `'${v}'`).join(", ")}`, () => {
    const lines = readDataSet().filter((line) => line.type === type);
    assert.ok(lines.length > 0, `events.jsonl has no ${type}`);
    const wrong = lines
      .map((line) => ({ id: line.id, value: dataOf(line)[field] }))
      .filter(({ value }) => typeof value !== "string" || !values.includes(value));
    assert.deepEqual(wrong, [], `these ${type} events have a ${field} orc's real log does not hold`);
  });
}

test("AC16 no orc.friction.noted.v1 in the synthetic data set has a delivery", () => {
  const notes = readDataSet().filter((line) => line.type === "orc.friction.noted.v1");
  assert.ok(notes.length > 0, "events.jsonl has no friction note");
  const withDelivery = notes.filter((line) => line.delivery != null).map((line) => line.id);
  assert.deepEqual(withDelivery, [], "these friction notes have a delivery");
});

test("AC16 every event id the synthetic data set held before is still in it with the same type, time, project, change and delivery", () => {
  assert.equal(SYNTHETIC_BEFORE.length, 78, "the list of earlier events should hold 78");
  const now = new Map(readDataSet().map((line) => [line.id, line]));
  for (const kept of SYNTHETIC_BEFORE) {
    const line = now.get(kept.id);
    assert.ok(line, `event ${kept.id} is no longer in events.jsonl`);
    assert.deepEqual(
      {
        id: line.id,
        type: line.type,
        time: line.time,
        project: line.project ?? null,
        change: line.change ?? null,
        delivery: line.delivery ?? null,
      },
      kept,
      `event ${kept.id} changed`,
    );
  }
});
