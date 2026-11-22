#!/usr/bin/env node
// The entry point of `flight`: wires the process into runCli.

import { runCli } from "./cli.ts";

process.exitCode = await runCli(process.argv.slice(2), {
  env: process.env,
  stdout: process.stdout,
  stderr: process.stderr,
  fetch: globalThis.fetch,
});
