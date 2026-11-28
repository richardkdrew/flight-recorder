#!/usr/bin/env node
// `make record`: runs each recorded case that is not hand-written again, against the live model: an ask
// case on a new synthetic log, a retro case through retro() on a new log of its own events. It writes the
// model's responses back to the case's file with the time and the outcome.
// It needs ANTHROPIC_API_KEY and spends a little; tests never run it.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ask,
  ASK_PROMPT_URL,
  MODEL,
  retro,
  RETRO_PROMPT_URL,
  type ModelRunner,
} from "@flight/core";

import { clock, loadConfig, now, processEnv } from "../src/config.ts";
import { anthropicRunner } from "../src/model.ts";
import { loadDataSet, seed } from "../src/seed.ts";
import { openLog } from "../src/sqlite-log.ts";
import { loadRecordings, Recording, RECORDINGS_URL } from "./replay.ts";

const config = loadConfig(processEnv());
if (config.apiKey === undefined) {
  process.stderr.write("record: ANTHROPIC_API_KEY is not set\n");
  process.exitCode = 1;
} else {
  process.exitCode = await recordAll(config.apiKey);
}

async function recordAll(apiKey: string): Promise<number> {
  const prompt = readFileSync(ASK_PROMPT_URL, "utf8");
  const retroPrompt = readFileSync(RETRO_PROMPT_URL, "utf8");
  const dir = mkdtempSync(join(tmpdir(), "flight-record-"));
  let failures = 0;
  try {
    for (const { name, recording } of loadRecordings()) {
      if (recording.hand_written) continue;
      const path = join(dir, name.replace(/\.json$/, ".db"));
      const seeded = seed(path, recording.events ?? loadDataSet());
      if (!seeded.ok) throw new Error(`could not seed ${path}`);
      const opened = openLog(path);
      if (!opened.ok) throw new Error(`could not open ${path}`);
      const responses: unknown[] = [];
      const recordingFetch: typeof fetch = async (input, init) => {
        const response = await fetch(input, init);
        const url = input instanceof Request ? input.url : String(input);
        if (response.ok && new URL(url).pathname.endsWith("/v1/messages")) {
          responses.push(await response.clone().json());
        }
        return response;
      };
      try {
        const outcome = await run(
          recording,
          opened.value.reader,
          anthropicRunner(apiKey, recordingFetch),
          recording.command === "retro" ? retroPrompt : prompt,
        );
        const updated = Recording.safeParse({
          ...recording,
          model: MODEL,
          recorded_at: now().toISOString(),
          outcome,
          responses,
        });
        if (!updated.success) {
          process.stderr.write(
            `record: ${name}: the case ended as ${outcome}, which a recording cannot hold; the file is unchanged\n`,
          );
          failures += 1;
          continue;
        }
        writeFileSync(
          new URL(name, RECORDINGS_URL),
          `${JSON.stringify(updated.data, null, 2)}\n`,
        );
        process.stdout.write(
          `record: ${name}: ${outcome} in ${String(responses.length)} model call(s)\n`,
        );
      } finally {
        opened.value.close();
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return failures > 0 ? 1 : 0;
}

/** Runs one case through the core, as `flight ask` or `flight retro` would, and gives how it ended. */
async function run(
  recording: Recording,
  log: Parameters<typeof ask>[1]["log"],
  model: ModelRunner,
  prompt: string,
): Promise<string> {
  if (recording.command === "retro") {
    const result = await retro({ log, model, prompt, clock });
    return result.ok ? result.value.kind : result.error.kind;
  }
  const result = await ask(recording.question ?? "", {
    log,
    model,
    prompt,
    clock,
  });
  return result.ok ? result.value.kind : result.error.kind;
}
