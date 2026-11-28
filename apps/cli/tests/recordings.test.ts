// Every recorded case, replayed: an ask case against the synthetic log, a retro case against its own small
// log. It ends as recorded, and what went to the model holds the prompt and the data only, with the same
// tools, instructions and limits each call. The retro case of issue #12 also checks what its causes cite.

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import * as z from "zod";

import {
  ASK_PROMPT_URL,
  DEFAULT_LIMITS,
  MODEL,
  RETRO_OUTPUT_TOKENS,
  RETRO_PROMPT_URL,
} from "@flight/core";

import { flight, makeLog, syntheticLog } from "./harness.ts";
import { loadRecordings, toolResults, type Recording } from "./replay.ts";

const PROMPT = readFileSync(ASK_PROMPT_URL, "utf8");
const RETRO_PROMPT = readFileSync(RETRO_PROMPT_URL, "utf8");

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
    case "retro":
      throw new Error("an ask case cannot end as a retro");
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
const askCases = recordings.filter((r) => r.recording.command === "ask");
const retroCases = recordings.filter((r) => r.recording.command === "retro");

/** The argv that replays an ask case. */
const askArgv = (recording: Recording): string[] => [
  "ask",
  recording.question ?? "",
  "--log",
  syntheticLog(),
];

/** Runs a retro case's `flight retro` on a new log of its own events. */
function replayRetro(recording: Recording) {
  return flight(
    ["retro", "--log", makeLog(recording.events ?? [])],
    recording.responses,
    { limits: recording.limits },
  );
}

test("there are recorded cases, and the hand-written ones were never recorded", () => {
  expect(askCases.length).toBeGreaterThan(0);
  expect(retroCases.length).toBeGreaterThan(0);
  for (const { recording } of recordings) {
    if (recording.hand_written) expect(recording.recorded_at).toBeNull();
  }
});

describe.each(askCases)("$name", ({ recording }) => {
  test(`ends as recorded: ${recording.outcome}`, async () => {
    const run = await flight(askArgv(recording), recording.responses, {
      limits: recording.limits,
    });
    expectOutcome(recording.outcome, run, recording.limits);
  });

  test("sends the same model, instructions, tools and output cap with every call", async () => {
    const run = await flight(askArgv(recording), recording.responses, {
      limits: recording.limits,
    });
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
  const run = await flight(askArgv(found.recording), found.recording.responses);
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

/** How a retro case ends: the change sections are printed whatever the model did. */
function expectRetroOutcome(
  outcome: Recording["outcome"],
  run: Awaited<ReturnType<typeof flight>>,
) {
  expect(run.stdout).toMatch(/^# Retro: /);
  switch (outcome) {
    case "retro":
      expect(run.code).toBe(0);
      expect(run.stdout).toContain("## Causes that repeat");
      break;
    case "not_enough_data":
      expect(run.code).toBe(0);
      expect(run.stdout).toContain("not enough data yet: ");
      break;
    case "withheld":
      expect(run.code).toBe(1);
      expect(run.stderr).toContain("causes withheld:");
      break;
    case "timeout":
    case "bad_reply":
      expect(run.code).toBe(1);
      expect(run.stdout).not.toContain("## Causes that repeat");
      break;
    case "answer":
    case "call_cap":
      throw new Error(`a retro case cannot end as ${outcome}`);
  }
  expect(run.stderr).toContain(`outcome=${outcome}`);
}

describe.each(retroCases)("$name", ({ recording }) => {
  test(`ends as recorded: ${recording.outcome}`, async () => {
    expectRetroOutcome(recording.outcome, await replayRetro(recording));
  });

  test("sends one request, with the retro prompt, no tools and the retro's output cap", async () => {
    const run = await replayRetro(recording);
    expect(run.sent).toHaveLength(1);
    const body = run.sent[0]?.body;
    expect(body?.["model"]).toBe(recording.model);
    expect(body?.["system"]).toBe(RETRO_PROMPT);
    expect(body?.["tools"] ?? []).toEqual([]);
    expect(body?.["max_tokens"]).toBe(RETRO_OUTPUT_TOKENS);
  });
});

describe("retro-claims-only-what-it-cites.json (issue #12)", () => {
  const found = retroCases.find(
    ({ name }) => name === "retro-claims-only-what-it-cites.json",
  );
  if (!found)
    throw new Error("the retro-claims-only-what-it-cites case is missing");
  const { recording } = found;
  const events = recording.events ?? [];
  const id = (
    change: string,
    test: (e: (typeof events)[number]) => boolean,
  ) => {
    const e = events.find((x) => x.change === change && test(x));
    if (!e) throw new Error(`the case has no such event of ${change}`);
    return e.id;
  };
  const ofChanges = (...changes: string[]) =>
    new Set(
      events
        .filter((e) => e.change !== null && changes.includes(e.change))
        .flatMap((e) => [e.id, e.delivery ?? e.id]),
    );

  // The two changes whose every wait was under an hour, the rule stop, and the checks that failed on the
  // test agent's skeleton before mooring-map's first build.
  const shortWaits = ofChanges("quay-labels", "mooring-map");
  const ruleStop = id(
    "berth-rules",
    (e) => e.type === "orc.run.escalated.v1" && e.data["kind"] === "rules",
  );
  const skeletonChecks = id(
    "mooring-map",
    (e) => e.type === "orc.checks.recorded.v1" && e.data["failed"] !== 0,
  );

  /** Each printed cause: its line, and the ids in its code spans. */
  async function causes() {
    const run = await replayRetro(recording);
    const section =
      run.stdout.split("## Causes that repeat")[1]?.split("\n## ")[0] ?? "";
    return section
      .split("\n")
      .filter((line) => /^\d+\. /.test(line))
      .map((line) => ({
        text: line.slice(0, line.lastIndexOf(" (")),
        cites: [...line.matchAll(/`([0-9a-f]{32})`/g)].map((m) => m[1]),
      }));
  }

  test("the log holds what the case is about", () => {
    expect(
      new Set(events.map((e) => e.change).filter((c) => c !== null)).size,
    ).toBe(4);
    expect(shortWaits.size).toBeGreaterThan(0);
    expect(ruleStop).toMatch(/^[0-9a-f]{32}$/);
    expect(skeletonChecks).toMatch(/^[0-9a-f]{32}$/);
  });

  test("prints at least one cause", async () => {
    expect((await causes()).length).toBeGreaterThan(0);
  });

  test("no cause that says 'hour' cites an event of a change whose every wait was under an hour", async () => {
    for (const cause of await causes()) {
      if (!/hour/i.test(cause.text)) continue;
      expect(
        cause.cites.filter((c) => c !== undefined && shortWaits.has(c)),
      ).toEqual([]);
    }
  });

  test("no cause that says 'test' cites the rule stop", async () => {
    for (const cause of await causes()) {
      if (/test/i.test(cause.text)) expect(cause.cites).not.toContain(ruleStop);
    }
  });

  test("no cause cites the checks that failed before the first build", async () => {
    for (const cause of await causes()) {
      expect(cause.cites).not.toContain(skeletonChecks);
    }
  });
});
