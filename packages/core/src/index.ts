// The public entry of @flight/core.
// Skeleton only: `ask` is a stub until the flight-ask change builds it.

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export interface Limits {
  readonly modelCalls: number;
  readonly timeoutSeconds: number;
  readonly outputTokens: number;
}

export interface AskFailure {
  readonly kind: "not_implemented";
}

export function ask(
  _question: string,
  _deps: unknown,
): Promise<Result<never, AskFailure>> {
  return Promise.resolve({ ok: false, error: { kind: "not_implemented" } });
}
