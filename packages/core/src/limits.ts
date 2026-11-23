// What one question may spend and what one tool result may hold (AGENT-APPS.md sections 2 and 6).

export interface Limits {
  /** Model calls one question may make. */
  readonly modelCalls: number;
  /** Seconds the whole question may take, model calls and tools together. */
  readonly timeoutSeconds: number;
  /** Output tokens one model call may produce. */
  readonly outputTokens: number;
}

export const DEFAULT_LIMITS: Limits = {
  modelCalls: 10,
  timeoutSeconds: 120,
  outputTokens: 4096,
};

/** Events or deliveries one tool result may hold. */
export const ROW_CAP = 100;

/** Bytes of UTF-8 JSON one tool result may hold. */
export const BYTE_CAP = 32_768;

/** Limits to use instead of the defaults; one left out or undefined keeps its default. */
export type LimitOverrides = {
  readonly [K in keyof Limits]?: Limits[K] | undefined;
};

/** The defaults with `overrides` on top; a value that is not a positive whole number is a bug in the caller. */
export function resolveLimits(overrides: LimitOverrides | undefined): Limits {
  const limits: Limits = {
    modelCalls: overrides?.modelCalls ?? DEFAULT_LIMITS.modelCalls,
    timeoutSeconds: overrides?.timeoutSeconds ?? DEFAULT_LIMITS.timeoutSeconds,
    outputTokens: overrides?.outputTokens ?? DEFAULT_LIMITS.outputTokens,
  };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(
        `limit ${name} must be a positive whole number, not ${String(value)}`,
      );
    }
  }
  return limits;
}
