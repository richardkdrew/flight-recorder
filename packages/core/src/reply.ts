// The model's final reply: the text of its last message, a JSON object parsed with a schema.
// A reply that does not fit is rejected, never repaired.

import * as z from "zod";

export const Reply = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("answer"),
    text: z.string().min(1),
    cites: z.array(z.string()),
  }),
  z.strictObject({
    kind: z.literal("not_enough_data"),
    needs: z.string().min(1),
  }),
]);

export type Reply = z.infer<typeof Reply>;

/** The reply in `text`, or null when it is not JSON of the reply's schema. */
export function parseReply(text: string): Reply | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = Reply.safeParse(value);
  return parsed.success ? parsed.data : null;
}
