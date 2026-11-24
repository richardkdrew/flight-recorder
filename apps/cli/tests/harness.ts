// What the CLI's tests share: temporary logs, and a run of `flight` against a replay of recorded replies.

import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

import { runCli, type CliDeps } from "../src/cli.ts";
import { loadDataSet, seed, type DataSetEvent } from "../src/seed.ts";
import { replay, type Sent } from "./replay.ts";

const made: string[] = [];
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

export function tempDir(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "flight-test-")));
  made.push(dir);
  return dir;
}

/** A new log holding `events`, written as `flight seed` writes one. */
export function makeLog(events: readonly DataSetEvent[]): string {
  const path = join(tempDir(), "events.db");
  const result = seed(path, events);
  if (!result.ok)
    throw new Error(`could not write a test log: ${result.error.kind}`);
  return path;
}

/** A new log holding the synthetic data set. */
export function syntheticLog(): string {
  return makeLog(loadDataSet());
}

export const hex32 = (prefix: string): string => prefix.padEnd(32, "0");

/** An event for a test log; ids are 32 hex characters, padded from the prefix given. */
export function event(
  id: string,
  fields: Partial<DataSetEvent> = {},
): DataSetEvent {
  return {
    id: hex32(id),
    time: "2026-11-01T09:00:00+00:00",
    type: "orc.friction.noted.v1",
    project: "/Users/someone/Work/alpha-shop",
    change: null,
    delivery: null,
    source: "orc@" + "1".repeat(40),
    data: { note: "a note" },
    ...fields,
  };
}

export interface Run {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly sent: readonly Sent[];
}

function sink() {
  const out = {
    text: "",
    write(chunk: string): boolean {
      out.text += chunk;
      return true;
    },
  };
  return out;
}

export const API_KEY = "sk-ant-test-not-a-real-key";

/** Runs `flight` with `argv` against a replay of `responses`, with a key and a state folder of its own. */
export async function flight(
  argv: readonly string[],
  responses: readonly Record<string, unknown>[] = [],
  options: Partial<Pick<CliDeps, "env" | "limits" | "signal">> = {},
): Promise<Run> {
  const model = replay(responses);
  const stdout = sink();
  const stderr = sink();
  const code = await runCli(argv, {
    env: options.env ?? {
      ANTHROPIC_API_KEY: API_KEY,
      XDG_STATE_HOME: join(tempDir(), "state"),
    },
    stdout,
    stderr,
    fetch: model.fetch,
    limits: options.limits,
    signal: options.signal,
  });
  return { code, stdout: stdout.text, stderr: stderr.text, sent: model.sent };
}
