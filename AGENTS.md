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
- The `<retro>` data cap is measured on `JSON.stringify(data)` before `</` is escaped as `<\/` for the delimiter, which is the size the acceptance tests measure (they parse the JSON back and stringify it again).
- `flight ask`'s code was out of scope for this change, so `ask.ts` still has its own copies of the prompt hash and the reply's text, which the retro takes from `prompt.ts` and `model.ts`.
- `data/synthetic/events.jsonl` now has 81 events: the 78 that `acceptance/fixtures/synthetic-before.ts` lists, and the three `merged` decisions of the older deliveries.

## Tests

- Unit tests live in `apps/cli/tests`, including those of the core's behaviour: the core's tsconfig covers only `src`, and its tests need `node:sqlite` to run the core's queries.
- `apps/cli/tests/recordings/*.json` are the recorded cases. A case with `hand_written: false` is refreshed by `make record`; `recorded_at: null` means it has never been recorded from the live model, and its responses were written by hand in the recorded form.
- The question's timeout is an `AbortSignal.timeout`, whose timer does not keep Node alive; a fake `fetch` that hangs must hold a timer of its own, as `apps/cli/tests/replay.ts` does.
- `acceptance/ac5-default-timeout.test.ts` waits the real 120 seconds and checks the time with `performance.now()`. If the Mac sleeps during it (on battery, `pmset -g log` shows `Maintenance Sleep` and `DarkWake`), it reports 400 seconds or more and fails, and `caffeinate -i` does not stop that sleep. Rerun it with the Mac awake before suspecting the timeout code.
- A tool result's byte cap is checked against the exact JSON `fitRows` emits, `truncated` included; `describe_log` passes its types and versions to it as one list, so the cap covers the whole result.

## The log

- A read-only `node:sqlite` connection to a WAL log leaves an empty `-wal` file and a `-shm` file beside it. The log's bytes never change, which is what the acceptance tests check; do not try to delete those files, since orc may be using them.
