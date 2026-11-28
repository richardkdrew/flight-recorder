// What `flight propose` reads and runs on the owner's Mac: the one line of the answer, and a program run
// with no shell, here a real Node process standing in for `gh`.

import { PassThrough } from "node:stream";
import { describe, expect, test } from "vitest";

import { readAnswer, runCommand } from "../src/terminal.ts";

const never = new AbortController().signal;

describe("readAnswer", () => {
  test("reads one line, without its newline", async () => {
    const input = new PassThrough();
    const answer = readAnswer(input, never);
    input.write("yes\nand more\n");
    await expect(answer).resolves.toBe("yes");
  });

  test("the end of input is an empty answer", async () => {
    const input = new PassThrough();
    const answer = readAnswer(input, never);
    input.end();
    await expect(answer).resolves.toBe("");
  });

  test("rejects when its signal aborts", async () => {
    const input = new PassThrough();
    const cancel = new AbortController();
    const answer = readAnswer(input, cancel.signal);
    cancel.abort();
    await expect(answer).rejects.toThrow();
  });
});

describe("runCommand", () => {
  const node = process.execPath;

  test("passes its arguments as they are, with no shell, and the input on standard input", async () => {
    const script =
      "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{process.stdout.write(JSON.stringify([process.argv.slice(1),s])+'\\n');process.stderr.write('note');})";
    const result = await runCommand(
      node,
      ["-e", script, "$(echo no)", "a b", "--title"],
      "the body\nline 2",
      never,
    );
    expect(result).toEqual({
      kind: "exited",
      code: 0,
      stdout: `${JSON.stringify([["$(echo no)", "a b", "--title"], "the body\nline 2"])}\n`,
      stderr: "note",
    });
  });

  test("gives the exit code of a program that fails", async () => {
    const result = await runCommand(node, ["-e", "process.exit(4)"], "", never);
    expect(result).toMatchObject({ kind: "exited", code: 4 });
  });

  test("a program that is not on the PATH is not found", async () => {
    await expect(
      runCommand("flight-no-such-program-here", [], "", never),
    ).resolves.toEqual({ kind: "not_found" });
  });

  test("a program that does not read its input is no error", async () => {
    const result = await runCommand(
      node,
      ["-e", "process.exit(0)"],
      "x".repeat(1_000_000),
      never,
    );
    expect(result).toMatchObject({ kind: "exited", code: 0 });
  });

  test("its signal stops a program that runs too long", async () => {
    const result = runCommand(
      node,
      ["-e", "setTimeout(() => {}, 60_000)"],
      "",
      AbortSignal.timeout(200),
    );
    await expect(result).rejects.toThrow();
  });
});
