#!/usr/bin/env node
// The entry point of `flight`: wires the process into runCli.

import { runCli } from "./cli.ts";

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
});
