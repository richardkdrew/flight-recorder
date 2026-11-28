# Notes for agents working on Flight Recorder

Read `docs/ARCHITECTURE.md` and `docs/adr/` first; these are the things they do not say.

## Running things

- Run everything through `make`: it runs on the Node in `.node-version` (26) through fnm, and the `node` on the PATH may be older.
  `dist/flight`, from `make build` (`scripts/build-dist`), needs nothing from the checkout: `dist/lib/` holds a copy of the pinned Node, the CLI and core as source, the data set and the runtime packages (`npm ci --omit=dev`, from npm's cache when it can).
  Anything new the CLI reads at run time through `import.meta.url` must be copied there too, or `dist/flight` breaks while `make dev` still works.
- `make check` never calls a live model. `make record` does: it needs `ANTHROPIC_API_KEY` and spends a little, so run it only when asked.
- The project's checks run on the owner's Mac; there is no CI workflow.
- `.npmrc` (`save-exact`, `ignore-scripts`, `engine-strict`, as the spec asks) is not in the repository yet: the engineering agent was not allowed to write it.
  Until it is, pass `--ignore-scripts` and `--save-exact` to npm yourself, as the Makefile does.

## The core

- `packages/core` must not import `@anthropic-ai/sdk`, not even its types: they import `undici-types`, which brings in `@types/node`, and then `types: []` no longer stops Node's globals.
  The CLI creates the client and passes its tool runner in as a `ModelRunner`; `apps/cli/tests/core-imports.test.ts` fails if the core imports anything but its own files and `zod`.
- The SDK's tool runner is thenable: never `await` it or return it from an async function, which would run the whole loop. Iterate it.
- The core's SQL uses numbered parameters (`?1`) and passes lists as one JSON parameter read with `json_each`, because D1 binds at most 100 parameters and has no named ones.
  Keep new queries that way so they run on D1 unchanged.
- Times in orc's log end in `+00:00`, not `Z`, so compare times with `julianday()`, never as strings.
- Only `apps/cli/src/main.ts` and `apps/cli/src/config.ts` may read `process.env` or the clock (eslint).
  A script entry point such as `apps/cli/tests/record.ts` gets them from `config.ts` (`processEnv`, `now`, `clock`).

## The retro

- `retro()` (`packages/core/src/retro.ts`) returns the change sections' facts on both sides of its `Result`, and `renderRetro()` (`retro-markdown.ts`) prints them either way; the CLI adds only the stderr lines.
  Keep any new field the site will need on the facts, not in the Markdown.
- A decision is read with `CASE WHEN json_valid(data) THEN json_extract(...) END`, not `json_valid(...) AND json_extract(...)`: SQLite does not promise to short-circuit `AND`, and `json_extract` throws on malformed JSON.
- The queries return `julianday(time)` as `jd`, and the code works in whole milliseconds, `Math.round(jd * 86_400_000)`, since flooring a difference of floating days can land a minute short.
  Events at the same time are ordered by `seq`: compare two events with `isAfter()`, never with `ms` alone, or an event recorded just after a friction note at the same time counts as before it and the note lands under the wrong change.
- Text from the log or the model goes into the Markdown through `markdownText()` in `retro-markdown.ts`. Only ids, inside code spans, go through `code()` instead.
  It escapes only what Markdown would act on: inline syntax, a `#`, `+`, `-` or `1.` at the start, and the `://`, `www.` and `@` of bare links. A `-`, `:`, `.` or `'` inside the text stays as it is, because the acceptance tests look for headings and notes exactly as written.
  A went-well item is its text, one space, then its ids, with no colon: the owner saw `working.:` when the text ended in a full stop. A cause keeps `: ` before its ids, since it follows the `(<n> changes, <m> events)` the code adds.
  `|` is escaped only by `cell()`, in the table. If `markdownText()` escaped it too, a cell would get `\\|`, which ends the cell.
- The `<retro>` data cap is measured on `JSON.stringify(data)` before `</` is escaped as `<\/` for the delimiter, which is the size the acceptance tests measure (they parse the JSON back and stringify it again).
- The retro's output cap is `RETRO_OUTPUT_TOKENS` (8,192), not `DEFAULT_LIMITS.outputTokens` (4,096, a question's): the owner's real log of 5 changes was cut off at 4,096. `deps.limits.outputTokens` still overrides it, the timeout stays the shared 120 seconds.
  A reply with `stop_reason` `max_tokens` is a `bad_reply` even if its text parses; the prompt's length limits (5 causes, 3 went-well items, two sentences and 10 ids each) are asked of the model, not enforced by the schema, which still allows 5 of each and any number of ids.
- `flight ask`'s code was out of scope for this change, so `ask.ts` still has its own copies of the prompt hash and the reply's text, which the retro takes from `prompt.ts` and `model.ts`.
- `data/synthetic/events.jsonl` now has 81 events: the 78 that `acceptance/fixtures/synthetic-before.ts` lists, and the three `merged` decisions of the older deliveries.

## The proposal

- `propose()` (`packages/core/src/propose.ts`) runs the retro through `retroWithData()`, which is `retro()` plus what it sent the model (`RetroSent`: each id's covered change, the deliveries, the events as sent).
  That is how the proposal is counted exactly as a cause is, and sends the events in the same shape, without the retro's code changing; `retro()` itself is a thin wrapper and must keep behaving the same (AC26).
- The second call is made only when the retro is `ok`, of kind `retro`, with at least one printed cause; otherwise `proposal` is null and the CLI ends exactly as `flight retro` would, adding the "a proposal needs at least one cause" line only when `## Causes that repeat` was printed.
- The checks run in a fixed order: citations first (only ids a printed cause cites), then `findPrivateDetail()` (a covered change's name, any project's last segment in the whole log, a path, an email address).
  The projects query (`SELECT DISTINCT project ...`) runs only after the citation check passes, and its names are never sent to the model.
- The issue's body is `renderProposal().body`, the printed section without its heading, so what is printed is what is posted; never build the body separately.
- `CliDeps.answer` and `CliDeps.run` are optional, and when either is absent the CLI asks nothing and runs nothing. `main.ts` passes `answer` only when stdin is a TTY, so piped input can never confirm.
  `terminal.ts` reads the answer with readline in `terminal: false`, so the terminal keeps its own line mode: it echoes what is typed and Ctrl-C reaches the process as SIGINT, which aborts `deps.signal` (exit 130).
- `gh` was not run while building this (the engineering agent may not run it): `--body-file -` reading standard input, `gh issue create` asking nothing when given a title and body, and the URL on its first line of stdout are assumptions to check on the owner's Mac.

## Tests

- Unit tests live in `apps/cli/tests`, including those of the core's behaviour: the core's tsconfig covers only `src`, and its tests need `node:sqlite` to run the core's queries.
- `apps/cli/tests/recordings/*.json` are the recorded cases. A case with `hand_written: false` is refreshed by `make record`; `recorded_at: null` means it has never been recorded from the live model, and its responses were written by hand in the recorded form.
  A case's `command` is `ask` (the default, with a `question`, on the synthetic data set) or `retro` (with `events`, its own small log, and no question); `make record` re-records a retro case through `retro()` on a new log of its events.
  `retro-claims-only-what-it-cites.json` (issue #12) is checked for what its causes cite, not only how it ends, so a live reply that overstates fails `make check` after `make record`; that is intended.
- `acceptance/ac19-default-timeout.test.ts` waits the real 120 seconds and `acceptance/ac23-gh-timeout.test.ts` the real 60 seconds of `gh`'s limit, so the acceptance run takes about two minutes.
- The question's timeout is an `AbortSignal.timeout`, whose timer does not keep Node alive; a fake `fetch` that hangs must hold a timer of its own, as `apps/cli/tests/replay.ts` does.
- `acceptance/ac5-default-timeout.test.ts` waits the real 120 seconds and checks the time with `performance.now()`. If the Mac sleeps during it (on battery, `pmset -g log` shows `Maintenance Sleep` and `DarkWake`), it reports 400 seconds or more and fails, and `caffeinate -i` does not stop that sleep. Rerun it with the Mac awake before suspecting the timeout code.
- A tool result's byte cap is checked against the exact JSON `fitRows` emits, `truncated` included; `describe_log` passes its types and versions to it as one list, so the cap covers the whole result.

## The log

- A read-only `node:sqlite` connection to a WAL log leaves an empty `-wal` file and a `-shm` file beside it. The log's bytes never change, which is what the acceptance tests check; do not try to delete those files, since orc may be using them.
