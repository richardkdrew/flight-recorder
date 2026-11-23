// The model provider, wired into the core: the Anthropic SDK's tool runner (ADR 0001, ADR 0003).

import Anthropic from "@anthropic-ai/sdk";

import type { ModelRunner } from "@flight/core";

const API_URL = "https://api.anthropic.com";
/** Retries for failures a retry can fix, with the SDK's backoff, inside the question's timeout. */
const RETRIES = 2;

/** A tool runner on Anthropic's API; `fetch` is the network, or a replay in tests. */
export function anthropicRunner(
  apiKey: string,
  fetch: typeof globalThis.fetch,
): ModelRunner {
  // Every option the SDK would otherwise read from the environment is given here, so only config.ts reads it.
  const client = new Anthropic({
    apiKey,
    baseURL: API_URL,
    fetch,
    maxRetries: RETRIES,
    logLevel: "warn",
  });
  return (request, signal) =>
    client.beta.messages.toolRunner(
      {
        ...request,
        messages: [...request.messages],
        tools: [...request.tools],
        // The full history goes with every call, so the provider keeps no conversation between calls.
        thread: false,
      },
      { signal },
    );
}
