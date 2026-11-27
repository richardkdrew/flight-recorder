// What the core needs from the model provider: a tool runner, which the runtime passes in.
// The core does not import the Anthropic SDK, whose types bring in Node's, so it stays loadable in a Worker;
// the SDK's `client.beta.messages.toolRunner` has exactly this shape.

import * as z from "zod";

/** A tool as a tool runner runs it: its definition for the model, an input parser, and the function. */
export interface RunnableTool {
  readonly type: "custom";
  readonly name: string;
  readonly description: string;
  readonly input_schema: {
    readonly type: "object";
    readonly [key: string]: unknown;
  };
  /** Throws when the input does not fit, which the runner sends back to the model as a tool error. */
  parse(input: unknown): unknown;
  run(input: unknown): Promise<string>;
}

/** One question's request: the same model, instructions and tools for every call. */
export interface ModelRequest {
  readonly model: string;
  readonly max_tokens: number;
  readonly system: string;
  readonly messages: readonly [
    { readonly role: "user"; readonly content: string },
  ];
  readonly tools: readonly RunnableTool[];
}

/**
 * Runs the tool loop for `request`: it yields each reply of the model, one per model call, and before the
 * next call runs the tools that reply asks for, sending back a tool error for an unknown tool or bad input.
 * The caller stops it by leaving the loop, and `signal` aborts the call in flight.
 */
export type ModelRunner = (
  request: ModelRequest,
  signal: AbortSignal,
) => AsyncIterable<unknown>;

/** A reply of the model, as far as the core reads it; parsed, since it comes from outside. */
export const ModelReply = z.object({
  content: z.array(
    z.looseObject({
      type: z.string(),
      text: z.string().optional(),
      name: z.string().optional(),
    }),
  ),
  stop_reason: z.string().nullable(),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    cache_creation_input_tokens: z.number().nullish(),
    cache_read_input_tokens: z.number().nullish(),
  }),
});

export type ModelReply = z.infer<typeof ModelReply>;

/** The text of a reply's text blocks, joined and trimmed. */
export function replyText(message: ModelReply): string {
  return message.content
    .flatMap((block) =>
      block.type === "text" && block.text !== undefined ? [block.text] : [],
    )
    .join("")
    .trim();
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A tool for a tool runner whose input is parsed with `schema`. */
export function tool<S extends z.ZodObject>(options: {
  readonly name: string;
  readonly description: string;
  readonly schema: S;
  readonly run: (input: z.infer<S>) => Promise<string>;
}): RunnableTool {
  return {
    type: "custom",
    name: options.name,
    description: options.description,
    input_schema: { ...z.toJSONSchema(options.schema), type: "object" },
    parse: (input) => options.schema.parse(input),
    run: (input) => options.run(options.schema.parse(input)),
  };
}
