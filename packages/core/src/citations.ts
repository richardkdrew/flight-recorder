// The citation check (AGENT-APPS.md section 1): every cited id must be an event id or delivery id that a
// tool returned during this question, and must exist in the log, checked with one query so a tool result
// cannot vouch for an id the log lacks.

import * as z from "zod";

import type { LogReader } from "./log.ts";

export interface CitationFailure {
  readonly id: string;
  readonly reason: "not_in_log" | "not_returned";
}

export interface CitationCheck {
  /** The cited ids in the reply's order, without duplicates. */
  readonly cited: readonly string[];
  /** The ids that failed, in the same order. */
  readonly failed: readonly CitationFailure[];
}

const Found = z.object({ id: z.string() });

export async function checkCitations(
  cites: readonly string[],
  returned: ReadonlySet<string>,
  log: LogReader,
): Promise<CitationCheck> {
  const cited = [...new Set(cites)];
  const rows =
    cited.length === 0
      ? []
      : await log.all(
          `SELECT value AS id FROM json_each(?1)
            WHERE value IN (SELECT id FROM events)
               OR value IN (SELECT delivery FROM events WHERE delivery IS NOT NULL)`,
          [JSON.stringify(cited)],
        );
  const inLog = new Set(rows.map((row) => Found.parse(row).id));
  const failed: CitationFailure[] = [];
  for (const id of cited) {
    if (!inLog.has(id)) failed.push({ id, reason: "not_in_log" });
    else if (!returned.has(id)) failed.push({ id, reason: "not_returned" });
  }
  return { cited, failed };
}
