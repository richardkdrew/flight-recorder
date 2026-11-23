// The public entry of @flight/core: the agent that answers questions about the factory's event log.

export { ask, MODEL } from "./ask.ts";
export type { AskDeps, AskFailure, AskOutcome, AskRecord } from "./ask.ts";
export type { CitationFailure } from "./citations.ts";
export { BYTE_CAP, DEFAULT_LIMITS, ROW_CAP } from "./limits.ts";
export type { LimitOverrides, Limits } from "./limits.ts";
export { projectName } from "./log.ts";
export type { ModelRequest, ModelRunner, RunnableTool } from "./model.ts";
export type { LogReader, SqlValue } from "./log.ts";
export type { Result } from "./result.ts";

/** Where the agent's prompt lives; the entry point reads it and passes its text to `ask`. */
export const ASK_PROMPT_URL = new URL("../prompts/ask.md", import.meta.url);
