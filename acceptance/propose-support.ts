// Helpers for the flight-propose acceptance tests: running `flight propose` (or `flight retro`) through runCli
// with a replay of the model, a fake answer at the terminal and a fake command runner that records each call,
// and reading the proposal's section from stdout.

import assert from "node:assert/strict";

import { runCli } from "../apps/cli/src/cli.ts";
import type { Event } from "./fixtures/events.ts";
import type { Reply } from "./fixtures/replies.ts";
import { retro, retroSetup, sections } from "./retro-support.ts";
import { lines, replay, show, type Run } from "./support.ts";

export const FACTORY_REPO = "richardkdrew/agentic-orc-factory";
export const QUESTION = `Open this proposal as an issue on ${FACTORY_REPO}? [y/N] `;
export const NOT_OPENED = "not opened";
export const NO_TERMINAL = "not opened: confirm at a terminal to open it as an issue";
export const ISSUE_URL = `https://github.com/${FACTORY_REPO}/issues/42`;

/** What `gh` does in the fake runner: exits with a code and output, is not found, or never ends until aborted. */
export type Gh =
  | { readonly kind: "exited"; readonly code: number; readonly stdout: string; readonly stderr: string }
  | { readonly kind: "not_found" }
  | { readonly kind: "hang" };

export const GH_OPENED: Gh = { kind: "exited", code: 0, stdout: `${ISSUE_URL}\nsecond line of gh output\n`, stderr: "" };

/** One call to deps.answer: what stdout and stderr held when it was asked, and the signal it got. */
export type AnswerCall = { readonly stdout: string; readonly stderr: string; readonly signal: unknown };
/** One call to deps.run. */
export type RunCall = {
  readonly file: unknown;
  readonly args: unknown;
  readonly input: string;
  readonly signal: unknown;
};

export type ProposeRun = Run & { readonly answers: AnswerCall[]; readonly runs: RunCall[] };

export type ProposeOptions = {
  readonly env: Record<string, string>;
  readonly replies?: readonly Reply[];
  readonly limits?: Record<string, number>;
  /** The one line the owner types; null for no terminal; "absent" passes no deps.answer at all. Default "y". */
  readonly answer?: string | null | "absent";
  /** What the fake `gh` does; "absent" passes no deps.run at all. Default: it opens issue 42. */
  readonly gh?: Gh | "absent";
};

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

async function inputText(input: unknown): Promise<string> {
  if (typeof input === "string") return input;
  if (input instanceof Uint8Array) return new TextDecoder().decode(input);
  if (input == null) return "";
  return new Response(input as BodyInit).text();
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("This operation was aborted", "AbortError");
}

/** Never settles until `signal` aborts; a timer keeps the test process alive meanwhile, for at most 150 seconds. */
function hang(signal: unknown): Promise<never> {
  return new Promise((_resolve, reject) => {
    const keepAlive = setTimeout(() => {}, 150_000);
    if (!(signal instanceof AbortSignal)) return;
    if (signal.aborted) {
      clearTimeout(keepAlive);
      reject(abortReason(signal));
      return;
    }
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(keepAlive);
        reject(abortReason(signal));
      },
      { once: true },
    );
  });
}

/** Runs `flight <argv>` through runCli with a replay of `replies`, the fake answer and the fake `gh`. */
export async function flightWith(argv: string[], options: ProposeOptions): Promise<ProposeRun> {
  const model = replay(options.replies ?? []);
  const stdout = collector();
  const stderr = collector();
  const answers: AnswerCall[] = [];
  const runs: RunCall[] = [];
  const deps: Record<string, unknown> = { env: options.env, stdout, stderr, fetch: model.fetch };
  if (options.limits) deps.limits = options.limits;
  const answer = options.answer === undefined ? "y" : options.answer;
  if (answer !== "absent") {
    deps.answer = async (signal: unknown): Promise<string | null> => {
      answers.push({ stdout: stdout.text, stderr: stderr.text, signal });
      return answer;
    };
  }
  const gh = options.gh ?? GH_OPENED;
  if (gh !== "absent") {
    deps.run = async (file: unknown, args: unknown, input: unknown, signal: unknown) => {
      runs.push({ file, args: Array.isArray(args) ? [...args] : args, input: await inputText(input), signal });
      if (gh.kind === "hang") return hang(signal);
      return gh;
    };
  }
  const started = performance.now();
  const code = await runCli(argv, deps as never);
  const seconds = (performance.now() - started) / 1000;
  return { code, stdout: stdout.text, stderr: stderr.text, requests: model.requests, seconds, answers, runs };
}

/** Runs `flight propose <args>`. */
export function propose(args: string[], options: ProposeOptions): Promise<ProposeRun> {
  return flightWith(["propose", ...args], options);
}

/** A log of `events` in a folder of its own, and what `flight retro` prints on it for `args` and `retroReplies`. */
export async function withRetro(
  events: readonly Event[],
  args: string[],
  retroReplies: readonly Reply[],
  limits?: Record<string, number>,
): Promise<{ log: string; env: Record<string, string>; retroRun: Run }> {
  const { log, env } = retroSetup(events);
  const retroRun = await retro([...args, "--log", log], { env, replies: retroReplies, ...(limits ? { limits } : {}) });
  return { log, env, retroRun };
}

/** A short account of a propose run, for assertion messages. */
export function showP(run: ProposeRun): string {
  const gh = run.runs.map((r) => `${String(r.file)} ${JSON.stringify(r.args)}`).join("\n");
  return `${show(run)}\n--- asked ${String(run.answers.length)} time(s); commands run: ${String(run.runs.length)} ---\n${gh}`;
}

export const hasProposal = (stdout: string): boolean => sections(stdout).some((s) => s.heading.startsWith("Proposal"));

/** Stdout starts with exactly what `flight retro` printed. */
export function assertStartsWithRetro(run: ProposeRun, retroRun: Run): void {
  assert.ok(retroRun.stdout.length > 0, `flight retro printed nothing\n${show(retroRun)}`);
  assert.ok(
    run.stdout.startsWith(retroRun.stdout),
    `flight propose's stdout should start with exactly what flight retro prints\n--- flight retro's stdout ---\n${retroRun.stdout}\n--- flight propose ---\n${showP(run)}`,
  );
}

/** No `## Proposal`, no question asked, no command run. */
export function assertNothingOffered(run: ProposeRun): void {
  assert.ok(!hasProposal(run.stdout), `a "## Proposal" was printed\n${showP(run)}`);
  assert.equal(run.answers.length, 0, `it asked for an answer\n${showP(run)}`);
  assert.ok(!run.stderr.includes("Open this proposal"), `it asked the question\n${showP(run)}`);
  assert.equal(run.runs.length, 0, `it ran a command\n${showP(run)}`);
}

/** The text from `prefix` to the end of the first stderr line holding it. */
export function stderrFrom(run: ProposeRun, prefix: string): string {
  const line = lines(run.stderr).find((l) => l.includes(prefix));
  assert.ok(line !== undefined, `stderr has no line with "${prefix}"\n${showP(run)}`);
  return line.slice(line.indexOf(prefix)).trimEnd();
}

/** Stderr's lines with the question removed, since an answer typed after it lands on the same line. */
export function stderrLines(run: ProposeRun): string[] {
  return lines(run.stderr.replaceAll(QUESTION, "\n")).map((l) => l.trimEnd());
}

/** The proposal's section of `stdout`: its `## Proposal: ` heading and the lines up to the next `## ` heading. */
export function proposalSection(stdout: string, run?: ProposeRun): { heading: string; lines: string[] } {
  const all = lines(stdout);
  const start = all.findIndex((l) => l.startsWith("## Proposal: "));
  assert.ok(start >= 0, `stdout has no "## Proposal: " line\n${run ? showP(run) : stdout}`);
  let end = all.length;
  for (let i = start + 1; i < all.length; i++) {
    if (all[i]!.startsWith("## ")) {
      end = i;
      break;
    }
  }
  return { heading: all[start]!, lines: all.slice(start + 1, end) };
}

/** The issue's body as AC23 defines it: the section without its heading and the blank lines around it. */
export function issueBody(stdout: string, run?: ProposeRun): string {
  const body = [...proposalSection(stdout, run).lines];
  while (body.length > 0 && body[0]!.trim() === "") body.shift();
  while (body.length > 0 && body[body.length - 1]!.trim() === "") body.pop();
  return body.join("\n");
}
