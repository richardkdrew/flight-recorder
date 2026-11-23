# Notes for agents working on Flight Recorder

Read `docs/ARCHITECTURE.md` and `docs/adr/` first; these are the things they do not say.

## Running things

- Run everything through `make`: it runs on the Node in `.node-version` (26) through fnm, and the `node` on the PATH may be older.
  `dist/flight`, from `make build`, does the same and holds this checkout's absolute path, so rebuild it after moving the checkout.
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

## Tests

- Unit tests live in `apps/cli/tests`, including those of the core's behaviour: the core's tsconfig covers only `src`, and its tests need `node:sqlite` to run the core's queries.
- `apps/cli/tests/recordings/*.json` are the recorded cases. A case with `hand_written: false` is refreshed by `make record`; `recorded_at: null` means it has never been recorded from the live model, and its responses were written by hand in the recorded form.
- The question's timeout is an `AbortSignal.timeout`, whose timer does not keep Node alive; a fake `fetch` that hangs must hold a timer of its own, as `apps/cli/tests/replay.ts` does.

## The log

- A read-only `node:sqlite` connection to a WAL log leaves an empty `-wal` file and a `-shm` file beside it. The log's bytes never change, which is what the acceptance tests check; do not try to delete those files, since orc may be using them.
