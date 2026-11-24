// Every recorded case, replayed against the synthetic log: it ends as recorded, and what went to the model
// holds the prompt, the question and tool results only, with the same tools, instructions and limits each call.

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import * as z from "zod";

import { ASK_PROMPT_URL, DEFAULT_LIMITS, MODEL } from "@flight/core";

import { flight, syntheticLog } from "./harness.ts";
import { loadRecordings, toolResults, type Recording } from "./replay.ts";

const PROMPT = readFileSync(ASK_PROMPT_URL, "utf8");

/** What each outcome prints, and where. */
function expectOutcome(
  outcome: Recording["outcome"],
  run: Awaited<ReturnType<typeof flight>>,
  limits: Recording["limits"],
) {
  const out = run.stdout.split("\n");
  switch (outcome) {
    case "answer":
      expect(run.code).toBe(0);
      expect(out.some((line) => line.startsWith("cited: "))).toBe(true);
      break;
    case "not_enough_data":
      expect(run.code).toBe(0);
      expect(out.some((line) => line.startsWith("not enough data yet: "))).toBe(
        true,
      );
      break;
    case "withheld":
      expect(run.code).toBe(1);
      expect(run.stderr).toContain("answer withheld:");
      expect(run.stdout).toBe("");
      break;
    case "call_cap":
      expect(run.code).toBe(1);
      expect(run.stderr).toContain(
        `stopped: reached the limit of ${String(limits?.modelCalls ?? DEFAULT_LIMITS.modelCalls)} model calls for one question`,
      );
      expect(run.stdout).toBe("");
      break;
    case "timeout":
      expect(run.code).toBe(1);
      expect(run.stderr).toContain(
        `stopped: no answer within ${String(limits?.timeoutSeconds ?? DEFAULT_LIMITS.timeoutSeconds)} seconds`,
      );
      expect(run.stdout).toBe("");
      break;
    case "bad_reply":
      expect(run.code).toBe(1);
      expect(run.stderr).toContain(
        "stopped: the model's reply was not in the expected form",
      );
      expect(run.stdout).toBe("");
      break;
  }
  expect(run.stderr).toContain(`outcome=${outcome}`);
}

const recordings = loadRecordings();

test("there are recorded cases, and the hand-written ones were never recorded", () => {
  expect(recordings.length).toBeGreaterThan(0);
  for (const { recording } of recordings) {
    if (recording.hand_written) expect(recording.recorded_at).toBeNull();
  }
});

describe.each(recordings)("$name", ({ recording }) => {
  test(`ends as recorded: ${recording.outcome}`, async () => {
    const run = await flight(
      ["ask", recording.question, "--log", syntheticLog()],
      recording.responses,
      { limits: recording.limits },
    );
    expectOutcome(recording.outcome, run, recording.limits);
  });

  test("sends the same model, instructions, tools and output cap with every call", async () => {
    const run = await flight(
      ["ask", recording.question, "--log", syntheticLog()],
      recording.responses,
      { limits: recording.limits },
    );
    expect(run.sent.length).toBeGreaterThan(0);
    const [first] = run.sent;
    for (const request of run.sent) {
      expect(request.body["model"]).toBe(MODEL);
      expect(request.body["model"]).toBe(recording.model);
      expect(request.body["system"]).toBe(PROMPT);
      expect(request.body["max_tokens"]).toBe(DEFAULT_LIMITS.outputTokens);
      expect(request.body["tools"]).toEqual(first?.body["tools"]);
    }
    const tools = z
      .array(z.looseObject({ name: z.string() }))
      .parse(first?.body["tools"]);
    expect(tools.map((t) => t.name)).toEqual([
      "describe_log",
      "list_deliveries",
      "read_delivery",
      "find_events",
    ]);
  });
});

test("a tool the model does not have, or input a tool does not take, goes back as a tool error", async () => {
  const found = recordings.find(
    ({ name }) => name === "injected-instruction.json",
  );
  if (!found) throw new Error("the injected-instruction case is missing");
  const run = await flight(
    ["ask", found.recording.question, "--log", syntheticLog()],
    found.recording.responses,
  );
  const [, unknownTool, badInput, goodInput] = run.sent;
  if (!unknownTool || !badInput || !goodInput)
    throw new Error(`only ${String(run.sent.length)} requests`);
  expect(toolResults(unknownTool)).toEqual([
    { text: "Error: Tool 'delete_events' not found", isError: true },
  ]);
  const [rejected] = toolResults(badInput);
  expect(rejected?.isError).toBe(true);
  expect(rejected?.text).toContain("sql");
  expect(toolResults(goodInput)[0]?.isError).toBe(false);
  expect(run.code).toBe(0);
});
