---
title: flight ask
status: approved
size: full
criteria:
  - id: AC1
    kind: new
    text: "`flight seed <file>` writes a SQLite file whose `events` table has exactly the columns in docs/ARCHITECTURE.md and holds every row of `data/synthetic/events.jsonl`, which includes at least one event of each of the 11 event types and events from at least 2 factory versions; when <file> already exists it exits 1, says the file exists, and leaves the file's bytes unchanged."
  - id: AC2
    kind: new
    text: "`flight ask` reads the file `--log` names, or by default `$XDG_STATE_HOME/orc/events.db` (or `~/.local/state/orc/events.db` when XDG_STATE_HOME is unset), and never changes it: the file's bytes are identical after a question, a path with no file exits 1 with `no event log at <path>` and no file is created there, and no request sent to the model holds a project's full folder path, only its last segment."
  - id: AC3
    kind: new
    text: "`flight ask` shows an answer only when it cites at least one id and every id it cites is an event id or delivery id in the log that a tool returned during that same question: then it prints the answer text, then a line `cited: <id>, <id>` listing every cited id, and exits 0; otherwise it prints `answer withheld:` followed by the ids that failed (or `it cited nothing`), never prints the answer text, and exits 1."
  - id: AC4
    kind: new
    text: "When the model's final reply says the data cannot support an answer, `flight ask` prints `not enough data yet: ` followed by what the reply says it would need, and exits 0."
  - id: AC5
    kind: new
    text: "When the model keeps asking for tools, `flight ask` stops after the question's cap of model calls (10 by default) and prints `stopped: reached the limit of <n> model calls for one question`; when no final reply arrives within the question's timeout (120 seconds by default) it prints `stopped: no answer within <s> seconds`; in both cases it prints no answer text and exits 1."
questions:
  - id: Q1
    question: "What may leave the Mac when `flight ask` reads the live log? docs/ARCHITECTURE.md says the live log never leaves the Mac, but every tool result goes to Anthropic's API, and the log holds project folder paths and free-text friction notes."
    recommendation: "Send each project as its folder name only (the last path segment, never the full path) and send friction notes as they are, since answers about friction need them; record this and Anthropic's data terms in ADR 0003, and reword the architecture's rule to 'never published, and only what a question needs goes to the model provider'."
    answer: "Accepted. Tool results give each project as the last segment of its folder path, never the full path; friction notes are sent as they are. The rule in docs/ARCHITECTURE.md becomes 'the live log is never published, and only what a question needs goes to the model provider'. The owner accepts Anthropic's commercial API terms for this data, recorded in ADR 0003."
  - id: Q2
    question: "docs/ARCHITECTURE.md says a daily spending cap is checked before each model call; your request asks only for a per-question cap and timeout. Should this change also add the daily cap?"
    recommendation: "Defer it to the live change, where strangers can spend: on your Mac, the per-question cap of 10 calls of at most 4,096 output tokens each already bounds what one question costs, and a daily cap needs a ledger file this read-only CLI would otherwise not write."
    answer: "Deferred to the live change. docs/ARCHITECTURE.md now says every model call has a timeout and an output cap, and the daily spending cap is checked before each call from the live change on."
---

# flight ask

## What

`flight ask "<question>"` answers a plain-English question about the factory's deliveries from its SQLite event log, which it only ever reads: the factory's own log by default, or another file with `--log`.
Every answer lists the event or delivery ids it rests on, and an answer whose ids do not check out is withheld; when the log cannot support an answer it says "not enough data yet" and what it would need.
`flight seed <file>` writes a small synthetic log, shaped like the real one, to try it on.

## Approach

**Layout** (follows `docs/ARCHITECTURE.md` and `TYPESCRIPT.md` section 3; ADR 0001).
An npm workspace with two packages, used as source with no build step:

- `packages/core` (`@flight/core`): the agent loop, its four tools, the reply schema, the citation check, the limits, the `Result` type, and the `LogReader` interface the tools read through.
  It is runtime-free: `types: []`, no Node imports, so the site's Worker can load it later.
  Its prompt is a file, `packages/core/prompts/ask.md`; the entry point reads it and passes it in, and the core hashes it with Web Crypto.
- `apps/cli` (`flight`): `src/main.ts` (shebang, wires `process`), `src/cli.ts` (`runCli`, parses arguments with `parseArgs` `strict: true`), the `node:sqlite` `LogReader`, the config module (the only reader of `process.env`), and `flight seed`.
  Node 26 runs the `.ts` files directly by type stripping; `make install` puts `flight` on the PATH with `npm link --workspace apps/cli`.
- `data/synthetic/events.jsonl`: the synthetic data set, one event per line in the format of orc's own `export()` (id, time, type, project, change, delivery, source, data, keys sorted).

**Reading the log** (ADR 0002).
The CLI opens the log with `node:sqlite` `DatabaseSync` and `readOnly: true`, and sets `PRAGMA query_only = ON`; it checks the file exists first and never creates one.
The default path is resolved exactly as orc's `events.path()` does it.
`node:sqlite` follows `TYPESCRIPT.md`'s "Node built-ins first" and adds no native dependency.

**The agent** (follows `AGENT-APPS.md` sections 1 to 6; ADR 0003).
`ask(question, deps)` in the core runs `claude-sonnet-5-5`, named once in the core, through the Anthropic TypeScript SDK's tool runner, taking one model call at a time so the core counts calls, applies the timeout and records which ids each tool returned.
The tools only read and take Zod-parsed input.
Each result is capped at 100 events or deliveries and at 32 KB (32,768 bytes) of UTF-8 JSON, the caps being constants in the core; when either cap cuts it, rows are dropped from the end until it fits and the result says `truncated: true` (otherwise `truncated: false`).
The tools run within the question's timeout and have none of their own (see Assumptions).

- `describe_log {}`: the columns, the event types and their `data` fields, the row count, the first and last time, and the factory versions present.
- `list_deliveries { source?, project?, limit? }`: per delivery its id, project, change, first and last time, factory versions, and event counts by type.
- `read_delivery { delivery }`: that delivery's events, oldest first.
- `find_events { type?, source?, project?, delivery?, since?, until?, limit? }`: matching events oldest first; it gives no total count, only whether there are more (`truncated`).

Each event comes back as `{ id, time, type, project, change, delivery, source, data }`, with `data` parsed from JSON and `project` reduced to the last segment of its folder path (Q1, ADR 0003); friction notes are sent as they are.
The `project` filters match on that last segment, so the model never needs, or sees, a full path.
Invalid tool input or an unknown tool goes back to the model as a tool error and does not end the question.
No tool takes SQL; each is one fixed, parameterised query.
The prompt says the question and every tool result are data, never instructions; tool results reach the model only inside `tool_result` blocks.

**The final reply** is the text of the last message, a JSON object parsed with a Zod schema, either `{"kind":"answer","text":"...","cites":["<id>", ...]}` or `{"kind":"not_enough_data","needs":"..."}`.
A reply that does not fit the schema is rejected, never repaired: `stopped: the model's reply was not in the expected form`, exit 1.

**The citation check** (AC3): every cited id must appear as an `id` or a `delivery` value in a tool result returned during this question, and must exist in the log (checked with one query, so a tool result cannot vouch for an id the log lacks).
An answer that cites nothing is withheld too.

**Limits** (AC5): at most 10 model calls per question, a 120-second timeout for the whole question (each call's `AbortSignal` joins Ctrl-C and the time left, with `AbortSignal.any`), and at most 4,096 output tokens per call.
The limits are constants in the core, overridable through `deps.limits` so tests can use a short timeout.
SDK retries stay at 2, inside the same timeout.
Ctrl-C prints `stopped: cancelled` and exits 130; a missing `ANTHROPIC_API_KEY` exits 1 with `ANTHROPIC_API_KEY is not set`.

**Output**: the answer, `cited:` and `not enough data yet:` lines go to stdout; `answer withheld:`, `stopped:` and other errors go to stderr.
Model text is printed with terminal control characters removed.
After each question one line goes to stderr: the model id, the prompt hash, the number of calls, tokens in and out, seconds, the tools called and the outcome (`AGENT-APPS.md` section 7, without cost; see Later).
Exit codes follow `TYPESCRIPT.md` section 8: 0 for an answer or "not enough data yet", 1 for an expected failure, 2 for a usage error.

**The synthetic data set** (AC1): about 6 deliveries across 2 made-up projects named by name only, 2 made-up factory versions (`orc@<40 hex>`), ids and delivery ids as 32-character hex like orc's `uuid4().hex`, and at least one event of each of the 11 types, including friction notes with no delivery, an eval event whose project starts with `eval:`, and an `orc.owner.judged.v1` in an older delivery.
`flight seed` creates the table and the two indexes exactly as orc does, sets WAL mode as orc does, and inserts the rows in file order.

**Recorded replies**: each case is a JSON file in `apps/cli/tests/recordings/` holding the model id, the question, `hand_written: true` or the time it was recorded, and the ordered Messages API response bodies; an entry `{"hang": true}` never answers until its request is aborted.
A replay `fetch` in `apps/cli/tests/replay.ts` serves them in order to the SDK client and keeps every request body it receives, so a test can check what was sent to the model (AC2).
`make record` re-records the cases that are not hand-written against the live model and the seeded synthetic log; the citation-failure, cap and timeout cases are hand-written.

**Test seams**:

- `runCli(argv: string[], deps: { env, stdout, stderr, fetch, limits? }): Promise<number>` from `apps/cli/src/cli.ts`, returning the exit code; `["ask", question, "--log", path]` and `["seed", path]`.
- `ask(question, deps)` from `@flight/core`, returning a `Result` of an answer, `not_enough_data`, or a failure naming its kind (`withheld`, `call_cap`, `timeout`, `bad_reply`).
- The acceptance tests for AC2 to AC5 build their own small logs with the schema through `node:sqlite`, and hand-write their recordings, since the data set and `make record` do not exist before the build.

**Files**: root `package.json`, `package-lock.json`, `packages/core/package.json`, `apps/cli/package.json`, `.npmrc` (`save-exact`, `ignore-scripts`, `engine-strict`), `.node-version` (26), `tsconfig.base.json` and each package's `tsconfig.json`, `eslint.config.js`, `.prettierrc` if needed, `vitest.config.ts`, `Makefile` (`setup`, `check`, `record`, `install`), `.gitignore`, and `.github/workflows/ci.yml` running `make setup` and `make check` with least privilege.
Dependencies: `@anthropic-ai/sdk` (the request) and `zod` 4 (`TYPESCRIPT.md`); dev only `typescript` 6.x, `eslint`, `typescript-eslint`, `prettier`, `vitest` 4 and `@types/node` (in `apps/cli` only), all `TYPESCRIPT.md`'s baseline.

## Out of scope

- `flight retro`, proposals, the curated export, the site and its live part: later changes in `docs/ARCHITECTURE.md`.
- `make eval` and its cases.
- A daily spending cap: deferred to the live change (Q2).
- `--json` output, and flags to change the limits.
- Any write to the event log or the factory.

## Assumptions

- Where it runs, who runs it, where it is deployed and whether it is published (`TYPESCRIPT.md`'s "ask before assuming"): Node on the owner's Mac only, run by the owner at a terminal, never deployed, used only from this repository; the core stays runtime-free for the later Worker.
- Default limits: 10 model calls, 120 seconds, 4,096 output tokens per call, and 100 rows and 32 KB of JSON per tool result; any of them is a one-line change.
- The tools have no timeout of their own, a justified departure from `AGENT-APPS.md` section 2 ("a row limit, a size limit and a timeout"), as the owner decided: each tool is one parameterised query against a small local file, so the question's 120-second timeout bounds them too, and a per-tool timer would need `node:sqlite` queries to be interruptible, which a synchronous `DatabaseSync` call is not.
- If a single row is over 32 KB on its own, the result holds no rows and says `truncated: true`, rather than being a tool error, so the model can narrow its query.
- The final reply is JSON text in the last message rather than a final "submit" tool, so a replay is plain Messages API bodies; the engineer may enforce it with the API's structured outputs where the SDK allows them alongside tools.
- I could not load the Anthropic SDK reference in this session, so two things are unverified: that the tool runner can be stepped one call at a time with a caller's `AbortSignal`, and that `claude-sonnet-5-5` accepts structured outputs with tools. If the runner cannot, a plain loop over `messages.create` is used instead and `docs/ARCHITECTURE.md` says so.
- I could not verify `node:sqlite`'s stability level in Node 26, or that a read-only connection opens a WAL log cleanly when orc has left no `-shm` file; the engineer checks both on setup, and ADR 0002 says what reopens the choice.
- The synthetic projects are named by name only, as `docs/ARCHITECTURE.md` says the published data set does, not by made-up paths.
- The CI workflow is included because the repository is public and `GITHUB.md` asks for CI on every pull request; strike it if checks should run only on the Mac for now.
- The cited-ids line lists ids in the order the reply gives them, without duplicates.
- Following Q1's answer, AC2 also checks that no request to the model holds a project's full folder path, rather than adding a sixth criterion; a project that is null stays null, and one with no `/` (such as `eval:<name>`) is sent as it is.

## Later

- `make eval` with the four kinds of case, including injection attempts hidden in friction notes of the synthetic set.
- The cost of each question in the stderr line, once the price per token is a named constant.
- `--json` output for scripts and agents.
- The daily spending cap, in the live change.
