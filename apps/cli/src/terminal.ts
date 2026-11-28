// What `flight propose` needs from the process to open an issue (ADR 0007): the owner's one line from the
// terminal, and a program run with no shell. main.ts passes them to runCli; tests run them on real processes.

import { spawn } from "node:child_process";
import type { Readable } from "node:stream";
import { createInterface } from "node:readline/promises";

import type { CommandResult, CommandRunner } from "./cli.ts";

/**
 * The owner's one line, read from the terminal. The terminal stays in its own line mode, so it echoes what
 * is typed and Ctrl-C still reaches the process as SIGINT; the end of input counts as an empty answer.
 */
export async function readAnswer(
  input: Readable,
  signal: AbortSignal,
): Promise<string> {
  const lines = createInterface({ input, terminal: false });
  try {
    const ended = new Promise<string>((resolve) => {
      lines.once("close", () => {
        resolve("");
      });
    });
    return await Promise.race([lines.question("", { signal }), ended]);
  } finally {
    lines.close();
  }
}

/** Bytes kept of a program's output: `gh issue create` prints one line. */
const OUTPUT_CAP = 64 * 1024;

/** Runs `file` with no shell, writes `input` to its standard input, and collects what it prints. */
export const runCommand: CommandRunner = (file, args, input, signal) =>
  new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(file, [...args], {
      shell: false,
      signal,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const out = { stdout: "", stderr: "" };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (out.stdout.length < OUTPUT_CAP) out.stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      if (out.stderr.length < OUTPUT_CAP) out.stderr += chunk;
    });
    child.once("error", (error) => {
      if ("code" in error && error.code === "ENOENT") {
        resolve({ kind: "not_found" });
      } else {
        reject(error);
      }
    });
    child.once("close", (code) => {
      resolve({ kind: "exited", code: code ?? 1, ...out });
    });
    // A program that exits without reading its input closes the pipe; that is not an error of ours.
    child.stdin.on("error", () => undefined);
    child.stdin.end(input);
  });
