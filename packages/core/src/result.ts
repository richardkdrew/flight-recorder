// The one Result type of the project (TYPESCRIPT.md section 1): an expected failure is a value, not an exception.

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };
