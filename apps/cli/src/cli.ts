// The `flight` command's top-level handler: parses arguments and returns the exit code.
// Skeleton only: every command reports "not implemented" until the flight-ask change builds it.

import { ask, type Limits } from "@flight/core";

export interface Output {
  write(text: string): unknown;
}

export interface CliDeps {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly stdout: Output;
  readonly stderr: Output;
  readonly fetch: typeof fetch;
  readonly limits?: Partial<Limits>;
}

export async function runCli(
  _argv: readonly string[],
  deps: CliDeps,
): Promise<number> {
  const result = await ask("", deps);
  if (!result.ok) {
    deps.stderr.write(`flight: ${result.error.kind.replace("_", " ")}\n`);
  }
  return 1;
}
