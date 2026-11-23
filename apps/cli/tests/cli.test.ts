// The `flight` command: its usage errors, its configuration errors, what it prints for each outcome,
// and the line it writes about each question.

import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { ASK_PROMPT_URL, MODEL } from "@flight/core";

import { clean } from "../src/cli.ts";
import { flight, syntheticLog, tempDir } from "./harness.ts";
import { finalReply, HANG, toolUse } from "./replay.ts";

const FRICTION = "f9ff6b379a7ad13c5abf91888aae3160";

describe("usage", () => {
  test.each([
    [[]],
    [["frobnicate"]],
    [["ask"]],
    [["ask", "  "]],
    [["ask", "one", "two"]],
    [["ask", "a question", "--verbose"]],
    [["ask", "a question", "--log"]],
    [["seed"]],
    [["seed", "a.db", "b.db"]],
    [["seed", "a.db", "--log", "b.db"]],
  ])("%j is a usage error: exit 2, with the usage on stderr", async (argv) => {
    const run = await flight(argv);
    expect(run.code).toBe(2);
    expect(run.stderr).toContain("usage: flight ask");
    expect(run.stdout).toBe("");
    expect(run.sent).toHaveLength(0);
  });

  test("--help prints the usage on stdout and exits 0", async () => {
    const run = await flight(["--help"]);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("usage: flight ask");
  });
});

describe("configuration", () => {
  test("a missing ANTHROPIC_API_KEY exits 1 and says so, before any model call", async () => {
    const run = await flight(
      ["ask", "a question", "--log", syntheticLog()],
      [],
      { env: {} },
    );
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("ANTHROPIC_API_KEY is not set");
    expect(run.sent).toHaveLength(0);
  });

  test("a file that is not an event log exits 1 and says so", async () => {
    const other = join(tempDir(), "not-a-log.txt");
    writeFileSync(other, "just text\n");
    const run = await flight(["ask", "a question", "--log", other]);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain(`${other} is not an event log`);
  });

  test("a folder where the log should be is no event log", async () => {
    const dir = tempDir();
    const run = await flight(["ask", "a question", "--log", dir]);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain(`no event log at ${dir}`);
  });

  // Root reads through permissions, so the folder would not stop it.
  test.skipIf(process.getuid?.() === 0)(
    "a log in a folder the user cannot search exits 1 and says so",
    async ({ onTestFinished }) => {
      const dir = join(tempDir(), "locked");
      mkdirSync(dir);
      const path = join(dir, "events.db");
      chmodSync(dir, 0o000);
      onTestFinished(() => {
        chmodSync(dir, 0o700);
      });
      const run = await flight(["ask", "a question", "--log", path]);
      expect(run.code).toBe(1);
      expect(run.stderr).toContain(`${path} is not an event log`);
      expect(run.stderr).toContain("EACCES");
      expect(run.sent).toHaveLength(0);
    },
  );
});

describe("output", () => {
  test("model text reaches the terminal with its control characters removed", async () => {
    const run = await flight(
      ["ask", "a question", "--log", syntheticLog()],
      [
        toolUse("find_events", { type: "orc.friction.noted.v1" }),
        finalReply({
          kind: "answer",
          text: "one \u001b[31mred\u001b[0m note\u0007\nand a second line",
          cites: [FRICTION],
        }),
      ],
    );
    expect(run.code).toBe(0);
    expect(run.stdout).toBe(
      `one [31mred[0m note\nand a second line\ncited: ${FRICTION}\n`,
    );
  });

  test("clean removes control characters but keeps tabs and newlines", () => {
    expect(clean("a\tb\nc\u0000d\u001be\u007ff\u009bg\rh")).toBe(
      "a\tb\ncdefgh",
    );
  });

  test("what the data would need is printed on one line", async () => {
    const run = await flight(
      ["ask", "a question", "--log", syntheticLog()],
      [
        finalReply({
          kind: "not_enough_data",
          needs: "more deliveries\n  from each version",
        }),
      ],
    );
    expect(run.code).toBe(0);
    expect(run.stdout).toBe(
      "not enough data yet: more deliveries from each version\n",
    );
  });

  test("a withheld answer names each failed id and why", async () => {
    const run = await flight(
      ["ask", "a question", "--log", syntheticLog()],
      [
        finalReply({
          kind: "answer",
          text: "WITHHELD",
          cites: [FRICTION, "0".repeat(32)],
        }),
      ],
    );
    expect(run.code).toBe(1);
    expect(run.stderr).toContain(
      `answer withheld: ${FRICTION} (no tool returned it for this question), ${"0".repeat(32)} (not in the log)`,
    );
    expect(run.stdout + run.stderr).not.toContain("WITHHELD\n");
  });

  test("a model call that fails exits 1 with a plain message and no answer", async () => {
    const run = await flight(
      ["ask", "a question", "--log", syntheticLog()],
      [],
    );
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("stopped: the model call failed:");
    expect(run.stdout).toBe("");
  });

  test("Ctrl-C stops the question: 'stopped: cancelled', exit 130", async () => {
    const cancel = new AbortController();
    const running = flight(
      ["ask", "a question", "--log", syntheticLog()],
      [HANG],
      { signal: cancel.signal },
    );
    setTimeout(() => {
      cancel.abort();
    }, 50);
    const run = await running;
    expect(run.code).toBe(130);
    expect(run.stderr).toContain("stopped: cancelled");
    expect(run.stdout).toBe("");
  });
});

describe("the line about each question", () => {
  test("names the model, the prompt's hash, the calls, the tokens, the time, the tools and the outcome", async () => {
    const run = await flight(
      ["ask", "a question", "--log", syntheticLog()],
      [
        toolUse("describe_log", {}),
        toolUse("find_events", { type: "orc.friction.noted.v1" }),
        finalReply({ kind: "answer", text: "ok", cites: [FRICTION] }),
      ],
    );
    expect(run.code).toBe(0);
    const hash = createHash("sha256")
      .update(readFileSync(ASK_PROMPT_URL))
      .digest("hex");
    const line = run.stderr
      .split("\n")
      .find((l) => l.startsWith("flight: model="));
    expect(line).toMatch(
      new RegExp(
        `^flight: model=${MODEL} prompt=${hash.slice(0, 12)} calls=3 tokens_in=300 tokens_out=30 seconds=\\d+\\.\\d tools=describe_log,find_events outcome=answer$`,
      ),
    );
  });

  test("is written for a failure too", async () => {
    const run = await flight(
      ["ask", "a question", "--log", syntheticLog()],
      [finalReply("not json")],
    );
    expect(run.code).toBe(1);
    expect(run.stderr).toContain(
      "stopped: the model's reply was not in the expected form",
    );
    expect(run.stderr).toMatch(/calls=1 .* tools=none outcome=bad_reply/);
  });
});

describe("the final reply's form", () => {
  test.each([
    ["prose", "The answer is yes."],
    [
      "JSON in a code fence",
      '```json\n{"kind":"not_enough_data","needs":"x"}\n```',
    ],
    ["an unknown kind", '{"kind":"maybe","text":"x"}'],
    ["an extra field", '{"kind":"not_enough_data","needs":"x","also":1}'],
    ["cites that are not strings", '{"kind":"answer","text":"x","cites":[1]}'],
    ["an empty answer", '{"kind":"answer","text":"","cites":[]}'],
  ])("%s is rejected, never repaired", async (_, text) => {
    const run = await flight(
      ["ask", "a question", "--log", syntheticLog()],
      [finalReply(text)],
    );
    expect(run.code).toBe(1);
    expect(run.stderr).toContain(
      "stopped: the model's reply was not in the expected form",
    );
    expect(run.stdout).toBe("");
  });
});

describe("limits", () => {
  test("a limit that is not a positive whole number is a bug, not a question", async () => {
    await expect(
      flight(["ask", "a question", "--log", syntheticLog()], [], {
        limits: { modelCalls: 0 },
      }),
    ).rejects.toThrow("limit modelCalls must be a positive whole number");
  });

  test("the output cap of each call is sent with it", async () => {
    const run = await flight(
      ["ask", "a question", "--log", syntheticLog()],
      [finalReply({ kind: "not_enough_data", needs: "x" })],
      { limits: { outputTokens: 512 } },
    );
    expect(run.sent[0]?.body["max_tokens"]).toBe(512);
  });
});
