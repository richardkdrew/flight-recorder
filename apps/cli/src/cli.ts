// The `flight` command's top-level handler: parses arguments, runs a command, and returns the exit code
// (TYPESCRIPT.md section 8): 0 for a result, 1 for an expected failure, 2 for a usage error.

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import {
  ask,
  ASK_PROMPT_URL,
  isDay,
  renderRetro,
  retro,
  RETRO_DATA_LIMIT_BYTES,
  RETRO_PROMPT_URL,
  type AskFailure,
  type AskRecord,
  type LimitOverrides,
  type LogReader,
  type RetroFailure,
  type RetroRecord,
} from "@flight/core";

import { clock, loadConfig } from "./config.ts";
import { anthropicRunner } from "./model.ts";
import { loadDataSet, seed } from "./seed.ts";
import { openLog } from "./sqlite-log.ts";

export interface Output {
  write(text: string): unknown;
}

export interface CliDeps {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly stdout: Output;
  readonly stderr: Output;
  readonly fetch: typeof fetch;
  /** Tests only: limits other than the defaults. */
  readonly limits?: LimitOverrides | undefined;
  /** Aborted on Ctrl-C. */
  readonly signal?: AbortSignal | undefined;
}

const USAGE = `usage: flight ask "<question>" [--log <file>]
       flight retro [--since <YYYY-MM-DD>] [--log <file>]
       flight seed <file>

  ask    answers a question about the factory's deliveries from its event log, which it only reads:
         by default $XDG_STATE_HOME/orc/events.db, or ~/.local/state/orc/events.db
  retro  prints a Markdown retro of the last 5 accepted changes, or of those accepted since a day
         in UTC (at most the 20 most recent), from the same log, which it only reads
  seed   writes the synthetic data set into a new log at <file>
`;

const EXIT_CANCELLED = 130;

// Control characters, except tab and newline, so model text cannot drive the terminal.
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;

/** Text from outside the program, with terminal control characters removed. */
export function clean(text: string): string {
  return text.replace(CONTROL, "");
}

const oneLine = (text: string): string => clean(text).replace(/\s*\n\s*/g, " ");

export async function runCli(
  argv: readonly string[],
  deps: CliDeps,
): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        log: { type: "string" },
        since: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (error) {
    return usageError(
      deps,
      error instanceof Error ? error.message : String(error),
    );
  }
  const { values, positionals } = parsed;
  const [command, ...rest] = positionals;
  if (values.help) {
    deps.stdout.write(USAGE);
    return 0;
  }
  if (command !== "retro" && values.since !== undefined) {
    return usageError(deps, "only retro takes --since");
  }
  if (command === "retro") {
    if (rest.length > 0) {
      return usageError(
        deps,
        "retro takes no arguments: flight retro [--since <YYYY-MM-DD>]",
      );
    }
    if (values.since !== undefined && !isDay(values.since)) {
      return usageError(
        deps,
        `--since takes a day as YYYY-MM-DD, such as 2026-11-01, not '${oneLine(values.since)}'`,
      );
    }
    return retroCommand(values.since, values.log, deps);
  }
  if (command === "ask") {
    const [question, ...extra] = rest;
    if (question === undefined || question.trim() === "" || extra.length > 0) {
      return usageError(
        deps,
        'ask takes one question, in quotes: flight ask "<question>"',
      );
    }
    return askCommand(question, values.log, deps);
  }
  if (command === "seed") {
    const [file, ...extra] = rest;
    if (
      file === undefined ||
      file === "" ||
      extra.length > 0 ||
      values.log !== undefined
    ) {
      return usageError(deps, "seed takes one file: flight seed <file>");
    }
    return seedCommand(file, deps);
  }
  return usageError(
    deps,
    command === undefined
      ? "no command given"
      : `unknown command '${clean(command)}'`,
  );
}

function usageError(deps: CliDeps, message: string): number {
  deps.stderr.write(`flight: ${message}\n\n${USAGE}`);
  return 2;
}

async function askCommand(
  question: string,
  log: string | undefined,
  deps: CliDeps,
): Promise<number> {
  const config = loadConfig(deps.env);
  const opened = openOrSay(log ?? config.defaultLogPath, deps);
  if (!opened.ok) return 1;
  try {
    if (config.apiKey === undefined) {
      deps.stderr.write("flight: ANTHROPIC_API_KEY is not set\n");
      return 1;
    }
    const result = await ask(question, {
      log: opened.value.reader,
      model: anthropicRunner(config.apiKey, deps.fetch),
      prompt: readFileSync(ASK_PROMPT_URL, "utf8"),
      clock,
      signal: deps.signal,
      limits: deps.limits,
    });
    if (result.ok) {
      const outcome = result.value;
      if (outcome.kind === "answer") {
        const text = clean(outcome.text).trimEnd();
        deps.stdout.write(`${text}\n`);
        deps.stdout.write(`cited: ${outcome.cites.join(", ")}\n`);
      } else {
        deps.stdout.write(`not enough data yet: ${oneLine(outcome.needs)}\n`);
      }
      deps.stderr.write(recordLine(outcome.record));
      return 0;
    }
    deps.stderr.write(`${failureLine(result.error)}\n`);
    deps.stderr.write(recordLine(result.error.record));
    return result.error.kind === "cancelled" ? EXIT_CANCELLED : 1;
  } finally {
    opened.value.close();
  }
}

/** Opens the log at `path`, or says on stderr why it cannot. */
function openOrSay(path: string, deps: CliDeps): ReturnType<typeof openLog> {
  const opened = openLog(path);
  if (!opened.ok) {
    deps.stderr.write(
      opened.error.kind === "missing"
        ? `flight: no event log at ${path}\n`
        : `flight: ${path} is not an event log: ${opened.error.message}\n`,
    );
  }
  return opened;
}

async function retroCommand(
  since: string | undefined,
  log: string | undefined,
  deps: CliDeps,
): Promise<number> {
  const config = loadConfig(deps.env);
  const opened = openOrSay(log ?? config.defaultLogPath, deps);
  if (!opened.ok) return 1;
  try {
    if (config.apiKey === undefined) {
      deps.stderr.write("flight: ANTHROPIC_API_KEY is not set\n");
      return 1;
    }
    return await runRetro(opened.value.reader, config.apiKey, since, deps);
  } finally {
    opened.value.close();
  }
}

async function runRetro(
  log: LogReader,
  apiKey: string,
  since: string | undefined,
  deps: CliDeps,
): Promise<number> {
  const result = await retro(
    {
      log,
      model: anthropicRunner(apiKey, deps.fetch),
      prompt: readFileSync(RETRO_PROMPT_URL, "utf8"),
      clock,
      signal: deps.signal,
      limits: deps.limits,
    },
    { since },
  );
  deps.stdout.write(renderRetro(result));
  const record = result.ok ? result.value.record : result.error.record;
  if (!result.ok) deps.stderr.write(`${retroFailureLine(result.error)}\n`);
  if (record) deps.stderr.write(recordLine(record));
  if (result.ok) return 0;
  return result.error.kind === "cancelled" ? EXIT_CANCELLED : 1;
}

function retroFailureLine(failure: RetroFailure): string {
  switch (failure.kind) {
    case "withheld":
      return failure.failed.length === 0
        ? "causes withheld: it cited nothing"
        : `causes withheld: ${failure.failed.map(shortId).join(", ")}`;
    case "data_too_large":
      return `stopped: the retro's data is ${String(Math.ceil(failure.bytes / 1000))} KB, over the ${String(RETRO_DATA_LIMIT_BYTES / 1000)} KB limit for one request; choose a later --since`;
    case "timeout":
      return `stopped: no answer within ${String(failure.seconds)} seconds`;
    case "bad_reply":
      return "stopped: the model's reply was not in the expected form";
    case "cancelled":
      return "stopped: cancelled";
    case "model_error":
      return `stopped: the model call failed: ${oneLine(failure.message)}`;
  }
}

const shortId = (id: string): string => oneLine(id).slice(0, 80);

function failureLine(failure: AskFailure): string {
  switch (failure.kind) {
    case "withheld": {
      if (failure.failed.length === 0)
        return "answer withheld: it cited nothing";
      const ids = failure.failed.map(
        (f) =>
          `${shortId(f.id)} (${f.reason === "not_in_log" ? "not in the log" : "no tool returned it for this question"})`,
      );
      return `answer withheld: ${ids.join(", ")}`;
    }
    case "call_cap":
      return `stopped: reached the limit of ${String(failure.calls)} model calls for one question`;
    case "timeout":
      return `stopped: no answer within ${String(failure.seconds)} seconds`;
    case "bad_reply":
      return "stopped: the model's reply was not in the expected form";
    case "cancelled":
      return "stopped: cancelled";
    case "model_error":
      return `stopped: the model call failed: ${oneLine(failure.message)}`;
  }
}

/** The one line about each question or retro (AGENT-APPS.md section 7), without cost for now. */
export function recordLine(record: AskRecord | RetroRecord): string {
  const fields = [
    `model=${record.model}`,
    `prompt=${record.promptHash.slice(0, 12)}`,
    `calls=${String(record.calls)}`,
    `tokens_in=${String(record.inputTokens)}`,
    `tokens_out=${String(record.outputTokens)}`,
    `seconds=${record.seconds.toFixed(1)}`,
    `tools=${record.tools.length > 0 ? record.tools.map(shortId).join(",") : "none"}`,
    `outcome=${record.outcome}`,
  ];
  return `flight: ${fields.join(" ")}\n`;
}

function seedCommand(file: string, deps: CliDeps): number {
  const result = seed(file, loadDataSet());
  if (!result.ok) {
    deps.stderr.write(
      result.error.kind === "exists"
        ? `flight: ${file} exists; flight seed writes only a new file and has left it unchanged\n`
        : `flight: could not write ${file}: ${result.error.message}\n`,
    );
    return 1;
  }
  deps.stdout.write(
    `wrote ${String(result.value)} synthetic events to ${file}\n`,
  );
  return 0;
}
