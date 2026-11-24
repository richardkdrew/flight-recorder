// Helpers for the acceptance tests: temporary folders, logs shaped like orc's,
// a replay `fetch` that serves hand-written model replies, and a runner for `flight`.

import { after } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { runCli } from "../apps/cli/src/cli.ts";
import { EVENTS, type Event } from "./fixtures/events.ts";
import type { Reply } from "./fixtures/replies.ts";

export const ROOT = resolve(import.meta.dirname, "..");

/** The events table and its indexes, as orc creates them (docs/ARCHITECTURE.md). */
export const ORC_SCHEMA = `
CREATE TABLE events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    time TEXT NOT NULL,
    type TEXT NOT NULL,
    project TEXT,
    change TEXT,
    delivery TEXT,
    source TEXT NOT NULL,
    data TEXT NOT NULL
);
CREATE INDEX events_project_change ON events (project, change);
CREATE INDEX events_type ON events (type);
`;

const made: string[] = [];
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/** A new empty folder, removed when the test file ends. */
export function tempDir(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "flight-acceptance-")));
  made.push(dir);
  return dir;
}

/** Writes a log at `path` in WAL mode, as orc keeps it, holding `events`. */
export function makeLog(path: string, events: readonly Event[] = EVENTS): string {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(ORC_SCHEMA);
  const insert = db.prepare(
    "INSERT INTO events (id, time, type, project, change, delivery, source, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  for (const e of events) {
    insert.run(e.id, e.time, e.type, e.project, e.change, e.delivery, e.source, JSON.stringify(e.data));
  }
  db.close();
  return path;
}

export function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export type Request = { url: string; body: string };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "request-id": "req_acceptance" },
  });
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("This operation was aborted", "AbortError");
}

/** Resolves after `ms`, or rejects when `signal` aborts; never settles if `ms` is Infinity and nothing aborts. */
function wait(ms: number, signal: AbortSignal | null | undefined): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    if (signal?.aborted) return reject(abortReason(signal));
    // A referenced timer keeps the test process alive while the request waits.
    const keepAlive = setInterval(() => {}, 1000);
    const timer = Number.isFinite(ms)
      ? setTimeout(() => {
          clearInterval(keepAlive);
          resolvePromise();
        }, ms)
      : undefined;
    signal?.addEventListener(
      "abort",
      () => {
        clearInterval(keepAlive);
        if (timer) clearTimeout(timer);
        reject(abortReason(signal));
      },
      { once: true },
    );
  });
}

/** A `fetch` that serves `replies` in order to the Messages API and keeps every request body it receives. */
export function replay(replies: readonly Reply[]) {
  const requests: Request[] = [];
  let next = 0;
  const fetch = async (input: unknown, init?: RequestInit): Promise<Response> => {
    let url: string;
    let body: string;
    let signal: AbortSignal | null | undefined;
    if (input instanceof Request) {
      url = input.url;
      body = await input.text();
      signal = init?.signal ?? input.signal;
    } else {
      url = String(input);
      const raw = init?.body;
      body = typeof raw === "string" ? raw : raw == null ? "" : await new Response(raw).text();
      signal = init?.signal;
    }
    if (!new URL(url).pathname.endsWith("/v1/messages")) {
      return json(404, { type: "error", error: { type: "not_found_error", message: `acceptance replay: no route for ${url}` } });
    }
    requests.push({ url, body });
    const reply = replies[next++];
    if (!reply) {
      return json(400, {
        type: "error",
        error: { type: "invalid_request_error", message: "acceptance replay: no recorded reply left for this request" },
      });
    }
    if (reply.kind === "hang") {
      await wait(Infinity, signal);
      throw new Error("unreachable");
    }
    if (reply.kind === "delayed") await wait(reply.ms, signal);
    return json(200, reply.body);
  };
  return { fetch, requests };
}

/** The text of every tool_result block in the requests sent to the model. */
export function toolResultTexts(requests: readonly Request[]): string[] {
  const texts: string[] = [];
  for (const request of requests) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(request.body);
    } catch {
      continue;
    }
    const messages = (parsed as { messages?: unknown }).messages;
    if (!Array.isArray(messages)) continue;
    for (const message of messages) {
      const content = (message as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        const b = block as { type?: unknown; content?: unknown };
        if (b.type !== "tool_result") continue;
        if (typeof b.content === "string") texts.push(b.content);
        else if (Array.isArray(b.content)) {
          for (const part of b.content) {
            const p = part as { text?: unknown };
            if (typeof p.text === "string") texts.push(p.text);
          }
        }
      }
    }
  }
  return texts;
}

function collector() {
  const decoder = new TextDecoder();
  const sink = {
    text: "",
    write(chunk: unknown): boolean {
      sink.text += typeof chunk === "string" ? chunk : decoder.decode(chunk as Uint8Array);
      return true;
    },
  };
  return sink;
}

export const API_KEY = "sk-ant-acceptance-not-a-real-key";

/** An environment for one run: a key, a home of its own, and XDG_STATE_HOME when given. */
export function envFor(home: string, xdgStateHome?: string): Record<string, string> {
  const env: Record<string, string> = { ANTHROPIC_API_KEY: API_KEY, HOME: home, PATH: process.env.PATH ?? "" };
  if (xdgStateHome !== undefined) env.XDG_STATE_HOME = xdgStateHome;
  return env;
}

export type Run = { code: number; stdout: string; stderr: string; requests: Request[]; seconds: number };

/** Runs `flight` through runCli with a replay of `replies` as the model. */
export async function flight(
  argv: string[],
  options: { env: Record<string, string>; replies?: readonly Reply[]; limits?: Record<string, number> },
): Promise<Run> {
  const model = replay(options.replies ?? []);
  const stdout = collector();
  const stderr = collector();
  const deps: Record<string, unknown> = { env: options.env, stdout, stderr, fetch: model.fetch };
  if (options.limits) deps.limits = options.limits;
  const started = performance.now();
  const code = await runCli(argv, deps as never);
  const seconds = (performance.now() - started) / 1000;
  return { code, stdout: stdout.text, stderr: stderr.text, requests: model.requests, seconds };
}

/** A log of its own and an environment whose default log path is empty. */
export function setup(): { dir: string; log: string; env: Record<string, string> } {
  const dir = tempDir();
  const log = makeLog(join(dir, "events.db"));
  const env = envFor(join(dir, "home"), join(dir, "state"));
  return { dir, log, env };
}

export function lines(text: string): string[] {
  return text.split(/\r?\n/);
}

/** A short account of a run, for assertion messages. */
export function show(run: Run): string {
  return `exit ${run.code}, ${run.requests.length} model call(s)\n--- stdout ---\n${run.stdout}\n--- stderr ---\n${run.stderr}`;
}
