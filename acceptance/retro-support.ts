// Helpers for the flight-retro acceptance tests: running `flight retro`, reading its Markdown,
// and reading the one request it sends to the model.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";

import type { Event } from "./fixtures/events.ts";
import type { Reply } from "./fixtures/replies.ts";
import { envFor, flight, makeLog, show, tempDir, type Request, type Run } from "./support.ts";

export const OTHER = "Other friction notes";
export const CAUSES = "Causes that repeat";
export const WENT_WELL = "What went well";
const SPECIAL = new Set([OTHER, CAUSES, WENT_WELL]);

/** A log of `events` in a folder of its own, and an environment whose default log path is empty. */
export function retroSetup(events: readonly Event[]): { dir: string; log: string; env: Record<string, string> } {
  const dir = tempDir();
  const log = makeLog(join(dir, "events.db"), events);
  const env = envFor(join(dir, "home"), join(dir, "state"));
  return { dir, log, env };
}

/** Runs `flight retro <args>` with a replay of `replies` as the model. */
export function retro(
  args: string[],
  options: { env: Record<string, string>; replies?: readonly Reply[]; limits?: Record<string, number> },
): Promise<Run> {
  return flight(["retro", ...args], options);
}

export type Section = { readonly heading: string; readonly lines: readonly string[] };

/** The `## ` sections of the Markdown, each with the lines up to the next `## ` heading. */
export function sections(markdown: string): Section[] {
  const result: { heading: string; lines: string[] }[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const match = /^##\s+(.*?)\s*$/.exec(line);
    if (match) result.push({ heading: match[1]!, lines: [] });
    else if (result.length > 0) result[result.length - 1]!.lines.push(line);
  }
  return result;
}

/** The headings of the change sections, in order: every `## ` heading but the three the retro adds. */
export function changeHeadings(markdown: string): string[] {
  return sections(markdown)
    .map((s) => s.heading)
    .filter((h) => !SPECIAL.has(h));
}

/** The one section with this heading; fails the test if there is none or more than one. */
export function sectionOf(run: Run, heading: string): Section {
  const found = sections(run.stdout).filter((s) => s.heading === heading);
  assert.equal(found.length, 1, `stdout should have exactly one section "## ${heading}"\n${show(run)}`);
  return found[0]!;
}

/** The cells of a Markdown table row, trimmed, with `\|` unescaped and surrounding backticks removed. */
function cells(line: string): string[] {
  let text = line.trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|") && !text.endsWith("\\|")) text = text.slice(0, -1);
  return text
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replaceAll("\\|", "|"))
    .map((cell) => {
      const ticked = /^`([^`]*)`$/.exec(cell);
      return ticked ? ticked[1]!.trim() : cell;
    });
}

export const TABLE_HEADER = ["Stop", "Event", "Your answer", "Event", "Waited"];

/** The rows of the section's `Stop | Event | Your answer | Event | Waited` table; null when it has none. */
export function tableRows(section: Section): string[][] | null {
  const lines = section.lines;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]!.trim().startsWith("|")) continue;
    if (JSON.stringify(cells(lines[i]!)) !== JSON.stringify(TABLE_HEADER)) continue;
    const rows: string[][] = [];
    let j = i + 1;
    if (j < lines.length && cells(lines[j]!).every((c) => /^:?-+:?$/.test(c))) j++;
    for (; j < lines.length && lines[j]!.trim().startsWith("|"); j++) rows.push(cells(lines[j]!));
    return rows;
  }
  return null;
}

const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+/;

/** The section's list items, each with any continuation lines joined to it by a space. */
export function listItems(section: Section): string[] {
  const items: string[] = [];
  let open = false;
  for (const line of section.lines) {
    if (LIST_ITEM.test(line)) {
      items.push(line.replace(LIST_ITEM, "").trim());
      open = true;
    } else if (open && line.trim() !== "" && /^\s+/.test(line)) {
      items[items.length - 1] += ` ${line.trim()}`;
    } else {
      open = false;
    }
  }
  return items;
}

/** The section's lines that are list items holding `id`. */
export function itemsWith(section: Section, id: string): string[] {
  return listItems(section).filter((item) => item.includes(id));
}

/** How many times `text` occurs in `within`. */
export function occurrences(within: string, text: string): number {
  return within.split(text).length - 1;
}

/** The request body sent to the model, parsed. */
export function body(request: Request): Record<string, unknown> {
  return JSON.parse(request.body) as Record<string, unknown>;
}

/** True when the request offers the model no tools. */
export function offersNoTools(request: Request): boolean {
  const tools = body(request).tools;
  return tools === undefined || (Array.isArray(tools) && tools.length === 0);
}

/** The text of the request's user messages. */
export function userText(request: Request): string {
  const messages = body(request).messages;
  if (!Array.isArray(messages)) return "";
  const texts: string[] = [];
  for (const message of messages) {
    const m = message as { role?: unknown; content?: unknown };
    if (m.role !== "user") continue;
    if (typeof m.content === "string") texts.push(m.content);
    else if (Array.isArray(m.content)) {
      for (const block of m.content) {
        const b = block as { type?: unknown; text?: unknown };
        if (b.type === "text" && typeof b.text === "string") texts.push(b.text);
      }
    }
  }
  return texts.join("\n");
}

/** The JSON object inside the request's `<retro>` delimiters, as text and parsed. */
export function retroData(request: Request): { text: string; value: unknown } {
  const text = userText(request);
  const start = text.indexOf("<retro>");
  const end = text.lastIndexOf("</retro>");
  assert.ok(start >= 0 && end > start, `the request's user message has no <retro>...</retro>:\n${text.slice(0, 2000)}`);
  const inner = text.slice(start + "<retro>".length, end).trim();
  let value: unknown;
  try {
    value = JSON.parse(inner);
  } catch (cause) {
    throw new Error(`the text inside <retro> is not one JSON object: ${inner.slice(0, 500)}`, { cause });
  }
  return { text: inner, value };
}

/** The bytes of UTF-8 in the `<retro>` object serialised with JSON.stringify and no spacing. */
export function retroDataBytes(request: Request): number {
  return Buffer.byteLength(JSON.stringify(retroData(request).value), "utf8");
}

/** Every file and folder under `dir`, as paths relative to it; none when it does not exist. */
export function filesUnder(dir: string): string[] {
  try {
    return (readdirSync(dir, { recursive: true }) as string[]).map((name) => String(name)).sort();
  } catch {
    return [];
  }
}
