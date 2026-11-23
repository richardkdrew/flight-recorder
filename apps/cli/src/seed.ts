// `flight seed <file>`: writes the synthetic data set into a new log, shaped exactly as orc keeps its own.

import { closeSync, openSync, readFileSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import * as z from "zod";

import type { Result } from "@flight/core";

export const DATA_SET_URL = new URL(
  "../../../data/synthetic/events.jsonl",
  import.meta.url,
);

/** The events table and its indexes, as orc's `events.py` creates them. */
const SCHEMA = `
CREATE TABLE events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    time TEXT NOT NULL,
    type TEXT NOT NULL,
    project TEXT,
    change TEXT,
    delivery TEXT,
    source TEXT NOT NULL,
    data TEXT NOT NULL
);
CREATE INDEX events_by_change ON events (project, change);
CREATE INDEX events_by_type ON events (type);
`;

const Hex32 = z.string().regex(/^[0-9a-f]{32}$/);

/** One line of the data set, in the format of orc's own `export()`. */
export const DataSetEvent = z.strictObject({
  id: Hex32,
  time: z.iso.datetime({ offset: true }),
  type: z.string().regex(/^orc\.[a-z]+\.[a-z]+\.v\d+$/),
  project: z.string().nullable(),
  change: z.string().nullable(),
  delivery: Hex32.nullable(),
  source: z.string().regex(/^orc@[0-9a-f]{40}$/),
  data: z.record(z.string(), z.unknown()),
});

export type DataSetEvent = z.infer<typeof DataSetEvent>;

/** The data set's events in file order; a line that does not parse is a bug in the data set. */
export function readDataSet(text: string): DataSetEvent[] {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line, i) => {
      try {
        return DataSetEvent.parse(JSON.parse(line));
      } catch (cause) {
        throw new Error(
          `events.jsonl line ${String(i + 1)} is not a valid event`,
          { cause },
        );
      }
    });
}

export type SeedFailure =
  | { readonly kind: "exists" }
  | { readonly kind: "unwritable"; readonly message: string };

/** Writes `events` into a new log at `path`, refusing any file already there. */
export function seed(
  path: string,
  events: readonly DataSetEvent[],
): Result<number, SeedFailure> {
  let fd: number;
  try {
    // Created exclusively, so a file that appears meanwhile is refused too, never overwritten.
    fd = openSync(path, "wx");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      return { ok: false, error: { kind: "exists" } };
    }
    return {
      ok: false,
      error: { kind: "unwritable", message: messageOf(error) },
    };
  }
  closeSync(fd);
  try {
    const db = new DatabaseSync(path);
    try {
      db.exec("PRAGMA journal_mode = WAL");
      db.exec(SCHEMA);
      const insert = db.prepare(
        "INSERT INTO events (id, time, type, project, change, delivery, source, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      );
      db.exec("BEGIN");
      for (const e of events) {
        insert.run(
          e.id,
          e.time,
          e.type,
          e.project,
          e.change,
          e.delivery,
          e.source,
          JSON.stringify(e.data),
        );
      }
      db.exec("COMMIT");
    } finally {
      db.close();
    }
  } catch (error) {
    // Only this run made the file, so a half-written log is removed rather than left behind.
    for (const suffix of ["", "-wal", "-shm", "-journal"])
      rmSync(path + suffix, { force: true });
    return {
      ok: false,
      error: { kind: "unwritable", message: messageOf(error) },
    };
  }
  return { ok: true, value: events.length };
}

/** The data set at `url`. */
export function loadDataSet(url: URL = DATA_SET_URL): DataSetEvent[] {
  return readDataSet(readFileSync(url, "utf8"));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
