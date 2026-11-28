#!/usr/bin/env node
// The entry point of `flight`: wires the process into runCli.

import { runCli } from "./cli.ts";
import { readAnswer, runCommand } from "./terminal.ts";

// Ctrl-C aborts the question, so its model call stops cleanly and the CLI says so.
const cancel = new AbortController();
process.once("SIGINT", () => {
  cancel.abort();
});

process.exitCode = await runCli(process.argv.slice(2), {
  env: process.env,
  stdout: process.stdout,
  stderr: process.stderr,
  fetch: globalThis.fetch,
  signal: cancel.signal,
  run: runCommand,
  // Only a terminal can confirm: piped input counts as no terminal, so a script can never open an issue.
  ...(process.stdin.isTTY
    ? { answer: (signal: AbortSignal) => readAnswer(process.stdin, signal) }
    : {}),
});
