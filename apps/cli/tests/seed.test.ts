// The synthetic data set and `flight seed`: shaped like orc's own log, with made-up projects named by name only.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "vitest";

import { loadDataSet } from "../src/seed.ts";
import { flight, tempDir } from "./harness.ts";

const events = loadDataSet();

test("every line of the data set is an event in orc's export format, oldest first", () => {
  expect(events.length).toBeGreaterThan(0);
  const times = events.map((e) => Date.parse(e.time));
  expect([...times].sort((a, b) => a - b)).toEqual(times);
  expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
});

test("it has about 6 deliveries across 2 projects, named by name only, and 2 factory versions", () => {
  const deliveries = new Set(
    events.flatMap((e) => (e.delivery ? [e.delivery] : [])),
  );
  expect(deliveries.size).toBe(6);
  const projects = new Set(
    events.flatMap((e) =>
      e.project && !e.project.startsWith("eval:") ? [e.project] : [],
    ),
  );
  expect(projects.size).toBe(2);
  for (const project of projects) expect(project).not.toContain("/");
  expect(new Set(events.map((e) => e.source)).size).toBe(2);
});

test("it has friction notes with no delivery, an eval event, and judging only in older deliveries", () => {
  const friction = events.filter((e) => e.type === "orc.friction.noted.v1");
  expect(friction.length).toBeGreaterThan(0);
  for (const note of friction) expect(note.delivery).toBeNull();
  expect(
    events.some(
      (e) =>
        e.type === "orc.eval.finished.v1" && e.project?.startsWith("eval:"),
    ),
  ).toBe(true);
  const older = events[0]?.source;
  const judged = events.filter((e) => e.type === "orc.owner.judged.v1");
  expect(judged.length).toBeGreaterThan(0);
  for (const e of judged) expect(e.source).toBe(older);
});

test("flight seed writes the rows in file order, in WAL mode, with orc's indexes", async () => {
  const file = join(tempDir(), "seeded.db");
  const run = await flight(["seed", file]);
  expect(run.code).toBe(0);
  expect(run.stdout).toBe(
    `wrote ${String(events.length)} synthetic events to ${file}\n`,
  );
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    expect(
      db
        .prepare("SELECT id FROM events ORDER BY seq")
        .all()
        .map((row) => row["id"]),
    ).toEqual(events.map((e) => e.id));
    expect(db.prepare("PRAGMA journal_mode").get()?.["journal_mode"]).toBe(
      "wal",
    );
    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL ORDER BY name",
      )
      .all();
    expect(indexes.map((row) => row["name"])).toEqual([
      "events_by_change",
      "events_by_type",
    ]);
  } finally {
    db.close();
  }
});

test("flight seed into a folder that does not exist exits 1, says so, and creates nothing", async () => {
  const file = join(tempDir(), "missing", "seeded.db");
  const run = await flight(["seed", file]);
  expect(run.code).toBe(1);
  expect(run.stderr).toContain(`could not write ${file}`);
  expect(existsSync(file)).toBe(false);
});
