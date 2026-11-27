// A retro as Markdown: the change sections from the code's facts, then, when the model's causes passed the
// citation check, the causes that repeat and what went well. Text from the log or the model is untrusted:
// control characters are removed, newlines become spaces, Markdown syntax is escaped so it prints as written,
// and `|` is escaped in table cells.

import type {
  RetroChange,
  RetroFacts,
  RetroNote,
  RetroResult,
  RetroRow,
} from "./retro.ts";

// Control characters, newlines and tabs included, so untrusted text stays on its line and cannot drive a terminal.
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;

/** Untrusted text on one line, with control characters removed. */
export function oneLine(text: string): string {
  return text
    .replace(/\s*[\r\n]+\s*/g, " ")
    .replace(CONTROL, "")
    .trim();
}

// Characters that start inline Markdown anywhere in a line: a backslash escape, code, emphasis, links and
// images, raw HTML and `<...>` autolinks, entities and strikethrough. `|` means something only in a table,
// so `cell` escapes it there: escaping it here too would make `\\|` in a cell, which ends the cell.
const INLINE = /[\\`*_[\]<>&~]/g;

/**
 * Untrusted text as Markdown that prints as written: on one line, with inline syntax escaped, a leading
 * `#`, `+`, `-` or `1.` escaped so it does not start a heading or list inside the line it is put in, and
 * bare URLs and email addresses broken up so GitHub-flavoured Markdown does not turn them into links.
 */
function markdownText(text: string): string {
  return oneLine(text)
    .replace(INLINE, "\\$&")
    .replace(/^[#+-]/, "\\$&")
    .replace(/^(\d+)([.)])/, "$1\\$2")
    .replace(/:(?=\/\/)/g, "\\:")
    .replace(/\b(www)\./gi, "$1\\.")
    .replaceAll("@", "\\@");
}

/** An id or other value as inline code. */
const code = (text: string): string =>
  `\`${oneLine(text).replaceAll("`", "")}\``;

/** Text for a table cell. */
const cell = (text: string): string => text.replaceAll("|", "\\|");

/** The day of a time in UTC, YYYY-MM-DD; the time as it is when it does not parse. */
function day(time: string): string {
  const date = new Date(time);
  return Number.isNaN(date.getTime())
    ? markdownText(time)
    : date.toISOString().slice(0, 10);
}

const plural = (n: number, one: string, many: string): string =>
  `${String(n)} ${n === 1 ? one : many}`;

export function waited(minutes: number | null): string {
  if (minutes === null) return "";
  if (minutes < 60) return `${String(minutes)} min`;
  return `${String(Math.floor(minutes / 60))} h ${String(minutes % 60)} min`;
}

function title(facts: RetroFacts): string {
  const n = facts.changes.length;
  const since = facts.since === null ? "" : ` since ${facts.since}`;
  const first = facts.changes[0];
  const last = facts.changes.at(-1);
  if (!first || !last) return `# Retro: no changes accepted${since}`;
  const range = `${day(first.accepted.time)} to ${day(last.accepted.time)}`;
  const leftOut = facts.leftOut
    ? `; the ${String(n)} most recent${since}, leaving out older ones`
    : "";
  return `# Retro: ${plural(n, "change", "changes")} accepted ${range}${leftOut}`;
}

function stopCells(row: RetroRow): [string, string] {
  switch (row.stop.kind) {
    case "escalated":
      return [
        `escalated: ${markdownText(row.stop.escalation)} (${markdownText(row.stop.count)})`,
        code(row.stop.id),
      ];
    case "command":
      return [
        `${markdownText(row.stop.command)} ended: ${markdownText(row.stop.outcome)}`,
        code(row.stop.id),
      ];
    case "none":
      return ["(none recorded)", ""];
  }
}

function noteItem(note: RetroNote): string {
  const text = note.note === null ? "(no note)" : markdownText(note.note);
  return `- ${text} (${code(note.id)})`;
}

function changeSection(change: RetroChange): string[] {
  const name =
    change.change === null ? "(no change name)" : markdownText(change.change);
  const project =
    change.project === null ? "no project" : markdownText(change.project);
  const c = change.counts;
  const lines = [
    `## ${name} (${project})`,
    "",
    `Delivery ${code(change.delivery)}, accepted ${day(change.accepted.time)} (${code(change.accepted.id)}).`,
    "",
    `build attempts: ${String(c.buildAttempts)}, spec review rounds: ${String(c.specReviews)}, code review rounds: ${String(c.codeReviews)}, rule stops: ${String(c.ruleStops)}, timeouts: ${String(c.timeouts)}`,
    "",
    "| Stop | Event | Your answer | Event | Waited |",
    "|---|---|---|---|---|",
    ...change.rows.map((row) => {
      const cells = [
        ...stopCells(row),
        markdownText(row.answer),
        code(row.answerId),
        waited(row.waitedMinutes),
      ];
      return `| ${cells.map(cell).join(" | ")} |`;
    }),
    "",
  ];
  if (change.notes.length === 0) {
    lines.push("Friction notes: none.", "");
  } else {
    lines.push("Friction notes:", "", ...change.notes.map(noteItem), "");
  }
  return lines;
}

const ids = (cites: readonly string[]): string => cites.map(code).join(", ");

/** The retro's Markdown, for stdout: the sections are printed whether or not the model's part succeeded. */
export function renderRetro(result: RetroResult): string {
  const facts = result.ok ? result.value : result.error;
  const lines = [title(facts), ""];
  for (const change of facts.changes) lines.push(...changeSection(change));
  if (facts.otherNotes.length > 0) {
    lines.push(
      "## Other friction notes",
      "",
      ...facts.otherNotes.map(noteItem),
      "",
    );
  }
  if (result.ok) {
    const outcome = result.value;
    if (outcome.kind === "not_enough_data") {
      lines.push(`not enough data yet: ${markdownText(outcome.needs)}`, "");
    } else {
      lines.push("## Causes that repeat", "");
      if (outcome.causes.length === 0) {
        lines.push("No cause repeats across these changes.");
      }
      for (const [i, cause] of outcome.causes.entries()) {
        lines.push(
          `${String(i + 1)}. ${markdownText(cause.text)} (${plural(cause.changes, "change", "changes")}, ${plural(cause.events, "event", "events")}): ${ids(cause.cites)}`,
        );
      }
      lines.push("", "## What went well", "");
      if (outcome.wentWell.length === 0) lines.push("Nothing to note.");
      for (const item of outcome.wentWell) {
        lines.push(`- ${markdownText(item.text)}: ${ids(item.cites)}`);
      }
      lines.push("");
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
