// The CLI's configuration, parsed once from the environment it is given; the only module that reads
// the environment or the clock (TYPESCRIPT.md section 5).

import { homedir } from "node:os";
import { join } from "node:path";
import * as z from "zod";

export interface Config {
  /** The key for the model provider, or undefined when it is not set. */
  readonly apiKey: string | undefined;
  /** The factory's own log, exactly where orc's `events.path()` puts it. */
  readonly defaultLogPath: string;
}

/** A variable that is empty counts as unset, as it does for orc. */
const Var = z
  .string()
  .optional()
  .transform((value) => (value === "" ? undefined : value));

const Env = z.object({
  ANTHROPIC_API_KEY: Var,
  XDG_STATE_HOME: Var,
  HOME: Var,
});

export function loadConfig(
  env: Readonly<Record<string, string | undefined>>,
): Config {
  const vars = Env.parse(env);
  // As orc's events.path() does it, with the home folder from HOME.
  const state =
    vars.XDG_STATE_HOME ?? join(vars.HOME ?? homedir(), ".local", "state");
  return {
    apiKey: vars.ANTHROPIC_API_KEY,
    defaultLogPath: join(state, "orc", "events.db"),
  };
}

/** Milliseconds on a monotonic clock. */
export const clock = (): number => performance.now();

/** The time now, for a script entry point such as `make record`. */
export const now = (): Date => new Date();

/** The process's environment, for a script entry point such as `make record`. */
export const processEnv = (): Readonly<Record<string, string | undefined>> =>
  process.env;
