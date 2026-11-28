// Hand-written Messages API response bodies, in the order a replay serves them.

export const MODEL = "claude-sonnet-5-5";

export type Reply =
  | { readonly kind: "body"; readonly body: Record<string, unknown> }
  | { readonly kind: "hang" }
  | { readonly kind: "delayed"; readonly ms: number; readonly body: Record<string, unknown> };

let counter = 0;
const next = (): number => ++counter;

function message(content: unknown[], stopReason: string): Record<string, unknown> {
  const n = next();
  return {
    id: `msg_acceptance_${n}`,
    type: "message",
    role: "assistant",
    model: MODEL,
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: 500,
      output_tokens: 40,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  };
}

/** A reply that asks for one tool call. */
export function toolUse(name: string, input: Record<string, unknown>): Reply {
  const n = next();
  return {
    kind: "body",
    body: message([{ type: "tool_use", id: `toolu_acceptance_${n}`, name, input }], "tool_use"),
  };
}

function finalText(value: unknown): Record<string, unknown> {
  return message([{ type: "text", text: JSON.stringify(value) }], "end_turn");
}

/** A final reply with an answer and the ids it cites. */
export function answer(text: string, cites: string[]): Reply {
  return { kind: "body", body: finalText({ kind: "answer", text, cites }) };
}

/** A final reply saying the data cannot support an answer. */
export function notEnoughData(needs: string): Reply {
  return { kind: "body", body: finalText({ kind: "not_enough_data", needs }) };
}

/** A request that never answers until it is aborted. */
export const HANG: Reply = { kind: "hang" };

/** A reply that arrives only after `ms`, unless its request is aborted first. */
export function delayed(ms: number, reply: Reply): Reply {
  if (reply.kind !== "body") throw new Error("delayed() takes a reply body");
  return { kind: "delayed", ms, body: reply.body };
}

/** A cause or a went-well item of a retro reply, with the ids it cites. */
export type RetroItem = { readonly text: string; readonly cites: readonly string[] };

/** A retro's final reply: the causes that repeat and what went well (docs/specs/flight-retro.md). */
export function retroReply(causes: readonly RetroItem[], wentWell: readonly RetroItem[]): Reply {
  return { kind: "body", body: finalText({ kind: "retro", causes, went_well: wentWell }) };
}

/** A final reply whose text is `text` as it is, in whatever form. */
export function rawText(text: string): Reply {
  return { kind: "body", body: message([{ type: "text", text }], "end_turn") };
}
