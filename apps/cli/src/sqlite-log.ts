// The event log on the owner's Mac, opened read-only through node:sqlite (ADR 0002).

import { statSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";

import type { LogReader, Result, SqlValue } from "@flight/core";

export interface OpenLog {
  readonly reader: LogReader;
  close(): void;
}

export type OpenFailure =
  | { readonly kind: "missing" }
  | { readonly kind: "unreadable"; readonly message: string };

/** Opens the log at `path` without ever creating or changing it. */
export function openLog(path: string): Result<OpenLog, OpenFailure> {
  // Checked first, because SQLite would create a missing file.
  if (!statSync(path, { throwIfNoEntry: false })?.isFile()) {
    return { ok: false, error: { kind: "missing" } };
  }
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(path, { readOnly: true });
  } catch (error) {
    return {
      ok: false,
      error: { kind: "unreadable", message: messageOf(error) },
    };
  }
  try {
    db.exec("PRAGMA query_only = ON");
    const table = db
      .prepare(
        "SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = 'events'",
      )
      .get();
    if (!table) {
      db.close();
      return {
        ok: false,
        error: { kind: "unreadable", message: "it has no events table" },
      };
    }
  } catch (error) {
    db.close();
    return {
      ok: false,
      error: { kind: "unreadable", message: messageOf(error) },
    };
  }
  const statements = new Map<string, StatementSync>();
  const reader: LogReader = {
    all(sql: string, params: readonly SqlValue[]) {
      try {
        let statement = statements.get(sql);
        if (!statement) {
          statement = db.prepare(sql);
          statements.set(sql, statement);
        }
        return Promise.resolve(statement.all(...params));
      } catch (error) {
        return Promise.reject(
          new Error(`the log could not be read: ${messageOf(error)}`, {
            cause: error,
          }),
        );
      }
    },
  };
  return {
    ok: true,
    value: {
      reader,
      close: () => {
        db.close();
      },
    },
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
