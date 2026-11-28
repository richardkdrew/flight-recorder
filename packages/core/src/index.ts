// The public entry of @flight/core: the agent that answers questions about the factory's event log,
// the retro over its latest accepted changes, and the one proposal drafted from a retro's causes.

export { ask, MODEL } from "./ask.ts";
export type { AskDeps, AskFailure, AskOutcome, AskRecord } from "./ask.ts";
export type { CitationFailure } from "./citations.ts";
export {
  BYTE_CAP,
  DEFAULT_LIMITS,
  RETRO_DATA_LIMIT_BYTES,
  RETRO_LAST,
  RETRO_MOST,
  RETRO_OUTPUT_TOKENS,
  ROW_CAP,
} from "./limits.ts";
export type { LimitOverrides, Limits } from "./limits.ts";
export { projectName } from "./log.ts";
export type { ModelRequest, ModelRunner, RunnableTool } from "./model.ts";
export type { LogReader, SqlValue } from "./log.ts";
export type { Result } from "./result.ts";
export { isDay, retro } from "./retro.ts";
export type {
  RetroCause,
  RetroChange,
  RetroCounts,
  RetroDeps,
  RetroFacts,
  RetroFailure,
  RetroItem,
  RetroNote,
  RetroOptions,
  RetroOutcome,
  RetroRecord,
  RetroResult,
  RetroRow,
  RetroStop,
} from "./retro.ts";
export { renderRetro } from "./retro-markdown.ts";
export { findPrivateDetail, propose } from "./propose.ts";
export type {
  PrivateDetail,
  Proposal,
  ProposalFailure,
  ProposalOutcome,
  ProposalResult,
  ProposeDeps,
  ProposeResult,
} from "./propose.ts";
export {
  NO_CAUSE_TO_PROPOSE,
  renderProposal,
  renderProposalNeeds,
} from "./propose-markdown.ts";
export type { RenderedProposal } from "./propose-markdown.ts";

/** Where the proposal's prompt lives; the entry point reads it and passes its text to `propose`. */
export const PROPOSE_PROMPT_URL = new URL(
  "../prompts/propose.md",
  import.meta.url,
);

/** Where the agent's prompt lives; the entry point reads it and passes its text to `ask`. */
export const ASK_PROMPT_URL = new URL("../prompts/ask.md", import.meta.url);

/** Where the retro's prompt lives; the entry point reads it and passes its text to `retro`. */
export const RETRO_PROMPT_URL = new URL("../prompts/retro.md", import.meta.url);
