// AC1: `flight seed <file>` writes the synthetic data set into a new log, and refuses a file that exists.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { ROOT, envFor, flight, sha256, show, tempDir } from "./support.ts";

const DATA_SET = join(ROOT, "data", "synthetic", "events.jsonl");

const TYPES = [
  "orc.agent.finished.v1",
  "orc.command.finished.v1",
  "orc.checks.recorded.v1",
  "orc.review.recorded.v1",
  "orc.run.escalated.v1",
  "orc.owner.decided.v1",
  "orc.owner.judged.v1",
  "orc.deploy.finished.v1",
  "orc.problem.reported.v1",
  "orc.eval.finished.v1",
  "orc.friction.noted.v1",
];

type Line = {
  id: string;
  time: string;
  type: string;
  project: string | null;
  change: string | null;
  delivery: string | null;
  source: string;
  data: unknown;
};

function readDataSet(): Line[] {
  assert.ok(existsSync(DATA_SET), `${DATA_SET} does not exist`);
  return readFileSync(DATA_SET, "utf8")
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

const parsedData = (value: unknown): unknown => (typeof value === "string" ? JSON.parse(value) : value);

async function seed(): Promise<string> {
  const dir = tempDir();
  const file = join(dir, "seeded.db");
  const run = await flight(["seed", file], { env: envFor(join(dir, "home"), join(dir, "state")) });
  assert.equal(run.code, 0, `flight seed should exit 0\n${show(run)}`);
  assert.ok(existsSync(file), `flight seed wrote no file at ${file}`);
  return file;
}

test("AC1 flight seed writes an events table with exactly the columns in docs/ARCHITECTURE.md", async () => {
  const file = await seed();
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const columns = db.prepare("PRAGMA table_info(events)").all().map((c) => ({
      name: c.name,
      type: String(c.type).toUpperCase(),
      notnull: Number(c.notnull),
      pk: Number(c.pk),
    }));
    assert.deepEqual(columns, [
      { name: "seq", type: "INTEGER", notnull: 0, pk: 1 },
      { name: "id", type: "TEXT", notnull: 1, pk: 0 },
      { name: "time", type: "TEXT", notnull: 1, pk: 0 },
      { name: "type", type: "TEXT", notnull: 1, pk: 0 },
      { name: "project", type: "TEXT", notnull: 0, pk: 0 },
      { name: "change", type: "TEXT", notnull: 0, pk: 0 },
      { name: "delivery", type: "TEXT", notnull: 0, pk: 0 },
      { name: "source", type: "TEXT", notnull: 1, pk: 0 },
      { name: "data", type: "TEXT", notnull: 1, pk: 0 },
    ]);
    const table = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'events'").get();
    assert.match(String(table?.sql), /seq\s+INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/i, "seq is INTEGER PRIMARY KEY AUTOINCREMENT");
    const uniqueOnId = db
      .prepare("PRAGMA index_list(events)")
      .all()
      .filter((index) => Number(index.unique) === 1)
      .some((index) => {
        const cols = db.prepare(`PRAGMA index_info(${JSON.stringify(String(index.name))})`).all().map((c) => c.name);
        return cols.length === 1 && cols[0] === "id";
      });
    assert.ok(uniqueOnId, "id is UNIQUE");
  } finally {
    db.close();
  }
});

test("AC1 flight seed writes every row of data/synthetic/events.jsonl", async () => {
  const file = await seed();
  const lines = readDataSet();
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const rows = db.prepare("SELECT id, time, type, project, change, delivery, source, data FROM events").all();
    assert.equal(rows.length, lines.length, "the log holds as many rows as events.jsonl has lines");
    const byId = new Map(rows.map((row) => [String(row.id), row]));
    for (const line of lines) {
      const row = byId.get(line.id);
      assert.ok(row, `event ${line.id} from events.jsonl is not in the log`);
      for (const key of ["time", "type", "project", "change", "delivery", "source"] as const) {
        assert.equal(row[key] ?? null, line[key] ?? null, `event ${line.id}: ${key}`);
      }
      assert.deepEqual(JSON.parse(String(row.data)), parsedData(line.data), `event ${line.id}: data`);
    }
  } finally {
    db.close();
  }
});

test("AC1 data/synthetic/events.jsonl holds every one of the 11 event types and at least 2 factory versions", () => {
  const lines = readDataSet();
  const types = new Set(lines.map((line) => line.type));
  for (const type of TYPES) assert.ok(types.has(type), `events.jsonl has no ${type} event`);
  const versions = new Set(lines.map((line) => line.source));
  assert.ok(versions.size >= 2, `events.jsonl has events from ${versions.size} factory version(s): ${[...versions].join(", ")}`);
});

test("AC1 flight seed refuses a file that exists, says so, and leaves its bytes unchanged", async () => {
  const dir = tempDir();
  const file = join(dir, "notes.db");
  writeFileSync(file, "not a database, and it must stay this way\n");
  const before = sha256(file);
  const run = await flight(["seed", file], { env: envFor(join(dir, "home"), join(dir, "state")) });
  assert.equal(run.code, 1, show(run));
  assert.match(run.stderr, /exists/i, `it should say the file exists\n${show(run)}`);
  assert.equal(sha256(file), before, "the existing file's bytes changed");
});

test("AC1 flight seed run twice on the same file refuses the second time and leaves the log unchanged", async () => {
  const file = await seed();
  const before = sha256(file);
  const dir = tempDir();
  const run = await flight(["seed", file], { env: envFor(join(dir, "home"), join(dir, "state")) });
  assert.equal(run.code, 1, show(run));
  assert.match(run.stderr, /exists/i, `it should say the file exists\n${show(run)}`);
  assert.equal(sha256(file), before, "the seeded log's bytes changed");
});
