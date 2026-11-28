// Recorded replies: each case in recordings/ holds a question (or, for a retro, a small log of its own) and
// the Messages API response bodies the model gave, in order. A replay `fetch` serves them to the SDK client
// and keeps every request body it receives, so a test can check what was sent to the model. Tests never
// call a live model.

import { readdirSync, readFileSync } from "node:fs";
import * as z from "zod";

import { DataSetEvent } from "../src/seed.ts";

export const RECORDINGS_URL = new URL("./recordings/", import.meta.url);

/** A response body, or `{ "hang": true }` for a request that never answers until it is aborted. */
const Response_ = z.union([
  z.strictObject({ hang: z.literal(true) }),
  z.record(z.string(), z.unknown()),
]);

export const Recording = z
  .strictObject({
    /** What the case shows, for a person reading it. */
    about: z.string(),
    model: z.string(),
    /** The command the case runs: `flight ask` by default, or `flight retro`. */
    command: z.enum(["ask", "retro"]).default("ask"),
    /** The question an `ask` case asks. */
    question: z.string().optional(),
    /** A retro case's own small synthetic log, which it runs on instead of the data set. */
    events: z.array(DataSetEvent).optional(),
    /** Hand-written cases are never re-recorded; the others are, by `make record`. */
    hand_written: z.boolean(),
    /** When `make record` last recorded the case from the live model; null for a case never recorded. */
    recorded_at: z.iso.datetime({ offset: true }).nullable(),
    /** How the case ends: an outcome or failure kind of `ask`, or of `retro`. */
    outcome: z.enum([
      "answer",
      "retro",
      "not_enough_data",
      "withheld",
      "call_cap",
      "timeout",
      "bad_reply",
    ]),
    /** Limits the case runs with, on top of the defaults. */
    limits: z
      .strictObject({
        modelCalls: z.number().optional(),
        timeoutSeconds: z.number().optional(),
      })
      .optional(),
    responses: z.array(Response_),
  })
  .refine(
    (r) =>
      r.command === "ask"
        ? r.question !== undefined && r.events === undefined
        : r.question === undefined && r.events !== undefined,
    "an ask case has a question and no events; a retro case has events and no question",
  );

export type Recording = z.infer<typeof Recording>;

export function loadRecordings(): { name: string; recording: Recording }[] {
  return readdirSync(RECORDINGS_URL)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => ({
      name,
      recording: Recording.parse(
        JSON.parse(readFileSync(new URL(name, RECORDINGS_URL), "utf8")),
      ),
    }));
}

export interface Sent {
  readonly url: string;
  readonly body: Record<string, unknown>;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "request-id": "req_replay" },
  });
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("aborted", "AbortError");
}

/** Never settles until `signal` aborts. */
function hang(signal: AbortSignal | null | undefined): Promise<never> {
  return new Promise((_, reject) => {
    if (!signal) return;
    if (signal.aborted) {
      reject(abortReason(signal));
      return;
    }
    // A referenced timer keeps the test process alive while the request waits, as a socket would.
    const keepAlive = setInterval(() => undefined, 1000);
    signal.addEventListener(
      "abort",
      () => {
        clearInterval(keepAlive);
        reject(abortReason(signal));
      },
      { once: true },
    );
  });
}

const Body = z.record(z.string(), z.unknown());

/** A `fetch` that serves `responses` in order to the Messages API and keeps every request body it receives. */
export function replay(responses: readonly z.infer<typeof Response_>[]) {
  const sent: Sent[] = [];
  let next = 0;
  const fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    const raw = typeof init?.body === "string" ? init.body : "";
    if (!new URL(url).pathname.endsWith("/v1/messages")) {
      return json(404, {
        type: "error",
        error: {
          type: "not_found_error",
          message: `replay: no route for ${url}`,
        },
      });
    }
    sent.push({ url, body: Body.parse(JSON.parse(raw)) });
    const response = responses[next++];
    if (!response) {
      return json(400, {
        type: "error",
        error: {
          type: "invalid_request_error",
          message: "replay: no recorded response left for this request",
        },
      });
    }
    if ("hang" in response && response.hang === true) return hang(init?.signal);
    return json(200, response);
  };
  return { fetch, sent };
}

const Block = z.looseObject({ type: z.string() });
const Message = z.looseObject({
  role: z.string(),
  content: z.union([z.string(), z.array(Block)]),
});
const ToolResult = z.looseObject({
  type: z.literal("tool_result"),
  tool_use_id: z.string(),
  content: z.union([z.string(), z.array(z.looseObject({ text: z.string() }))]),
  is_error: z.boolean().optional(),
});

/** The tool results in a request, in order, each with its text and whether it is an error. */
export function toolResults(
  request: Sent,
): { text: string; isError: boolean }[] {
  const messages = z.array(Message).parse(request.body["messages"]);
  const last = messages.at(-1);
  if (!last || typeof last.content === "string") return [];
  return last.content.flatMap((block) => {
    if (block.type !== "tool_result") return [];
    const result = ToolResult.parse(block);
    const text =
      typeof result.content === "string"
        ? result.content
        : result.content.map((part) => part.text).join("");
    return [{ text, isError: result.is_error === true }];
  });
}

let counter = 0;

/** A response body that asks for one tool call. */
export function toolUse(
  name: string,
  input: Record<string, unknown>,
): Record<string, unknown> {
  counter += 1;
  return message(
    [{ type: "tool_use", id: `toolu_test_${String(counter)}`, name, input }],
    "tool_use",
  );
}

/** A final response body whose text is `value` as JSON, or `value` itself when it is a string. */
export function finalReply(value: unknown): Record<string, unknown> {
  return message(
    [
      {
        type: "text",
        text: typeof value === "string" ? value : JSON.stringify(value),
      },
    ],
    "end_turn",
  );
}

export const HANG = { hang: true } as const;

function message(
  content: unknown[],
  stopReason: string,
): Record<string, unknown> {
  counter += 1;
  return {
    id: `msg_test_${String(counter)}`,
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: 100,
      output_tokens: 10,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  };
}
