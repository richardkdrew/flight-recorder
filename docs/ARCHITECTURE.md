# Flight Recorder

Flight Recorder is an agent that reads a software factory's event log, explains what happened in each delivery, and proposes one improvement to the factory at a time.
The factory is agentic-orc-factory: a delivery method in which the owner agrees a spec, agents build, test and review it, and the owner accepts the result.
Flight Recorder is built by that factory, and its own deliveries are part of the log it reads.

Pitch: the factory built the thing that critiques the factory.

## Who it is for

- **The owner,** on their Mac: a CLI that reads the factory's live event log.
- **Anyone on the web:** a public site on Cloudflare that explains the factory and lets visitors question Flight Recorder, on a published data set only, never the live log.
- **Anyone reading this repository:** it is public from its first commit, and its pull requests show each change going through the factory: the spec, the tests, the review findings and the owner's decisions.

## What the factory records

The factory keeps one SQLite file, `$XDG_STATE_HOME/orc/events.db` (by default `~/.local/state/orc/events.db`), for every project it builds.
It has one table, and rows are only ever added:

```sql
CREATE TABLE events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    time TEXT NOT NULL,        -- ISO 8601, UTC
    type TEXT NOT NULL,
    project TEXT,              -- the project's folder on the owner's Mac, so private
    change TEXT,               -- the change's name
    delivery TEXT,             -- one id per change, from its spec to its merge
    source TEXT NOT NULL,      -- the factory version, orc@<commit>
    data TEXT NOT NULL         -- JSON, only the fields listed below
);
```

| Type | `data` fields |
|---|---|
| `orc.agent.finished.v1` | agent, harness, model, models, effort, brief (a hash of the agent's instructions), seconds, outcome (`succeeded`, `failed`, `timed out`), input_tokens, cached_tokens, output_tokens, cost_usd |
| `orc.command.finished.v1` | command, seconds, outcome (`succeeded`, `stopped`) |
| `orc.checks.recorded.v1` | commit, where (CI or the owner's Mac), passed, failed |
| `orc.review.recorded.v1` | kind (spec or code), commit, verdict (`pass`, `changes_requested`), blocking, should_fix, observation (counts) |
| `orc.run.escalated.v1` | kind (`build attempts`, `rules`, `review rounds`, `frozen tests`), count, commit |
| `orc.owner.decided.v1` | decision (`approved`, `answered`, `reopened`, `allowed`, `allowed past review`, `sent back`, `corrected tests`, `accepted`, `released`; and `merged`, from changes merged before orc had an accept step), questions, despite_review, commit, reviewed_commit, version |
| `orc.owner.judged.v1` | verdict (`works`, `problems`), commit; only in older deliveries, before accepting a preview replaced judging after the merge |
| `orc.deploy.finished.v1` | environment, commit, outcome, seconds |
| `orc.problem.reported.v1` | issue: a problem found after the merge |
| `orc.eval.finished.v1` | suite, cases, passed, harness, model, effort |
| `orc.friction.noted.v1` | note: free text, and the only free text in the log; never a delivery, and sometimes no project |

Event ids and delivery ids are 32-character hex strings, and orc keeps the file in WAL mode, with indexes on `(project, change)` and on `type`.
A change is accepted when its delivery has a decision `accepted`; `merged` does not count, and a rule stop is an escalation of kind `rules`.
The synthetic data set uses these same values.
The log holds no prompts, code, replies or review text.
Review findings, escalations and the owner's decisions in words live on each change's pull request, as comments.
The time from one command ending to the next starting is time the change waited on the owner, since nothing runs between two commands.
`orc stats` already reports four numbers for each factory version: changes accepted first time against those sent back, minutes waiting on the owner, review rounds and cost per change, and problems found after the merge.

## The factory's flow, as the app must describe it

1. **Spec:** the design agent drafts; a model from another vendor reviews it once; the owner approves it.
2. **Tests:** the test agent writes the acceptance tests and a smoke check from the criteria, before the build.
3. **Build:** the engineering agent builds until the checks and the tests pass, in up to 3 attempts.
4. **Checks:** run on the latest commit, in CI or on the owner's Mac.
5. **Review:** the other vendor's model breaks the code on purpose, in up to 3 rounds.
6. **Preview:** the latest commit is built or deployed for the owner to try.
7. **Accept:** the owner accepts it, and orc merges it, or sends it back with what is wrong.
8. **Release:** the owner says when an accepted build goes to the next environment.

A run also stops for escalations: a change to dependencies, CI or deploy configuration, lint settings, tests, or a destructive migration; the owner allows it or sends it back.
A small change has up to 3 criteria, no spec review, and up to 2 review rounds.

## The agent

It is a real agent, not a fixed prompt: for each question the model chooses which queries to run, runs them through its tools, reads the results, and carries on until it can answer with citations or must say there is not enough data.

- Its tools only read: `describe_log`, `list_deliveries`, `read_delivery` and `find_events`, each one fixed query with parameters.
  No tool takes SQL from the model.
- Every tool returns at most a set number of rows, and every question has a cap on model calls and a timeout, and says so plainly when it hits one.
- Its final reply is JSON parsed with a schema: an answer with the ids it cites, or "not enough data yet" with what it would need.
- It runs on the Anthropic TypeScript SDK's tool runner, which works the same in Node and in Cloudflare Workers.
  The runtime passes the runner into the core, which steps it one model call at a time, so the core counts the calls, applies the timeout and records which ids each tool returned.
  The core does not import the SDK itself, because the SDK's types bring in Node's (ADR 0001).
- The CLI uses `claude-sonnet-5-5`.
- A retro is the exception (ADR 0004): the code builds each change's section from fixed queries, and the model, in one call with no tools, writes only the causes that repeat and what went well over the events the code chose; the core checks their citations and counts them.

## Parts

- **`packages/core`:** the agent: its tools, its prompts (as files), the citation check, the "not enough data" rule and the limits.
  It reaches data only through a small interface for read-only queries, so it never knows whether the data is a local SQLite file or D1, and the model only through a tool runner the runtime passes in.
  The queries are the core's own fixed SQL, which runs on SQLite and on D1 alike.
- **`apps/cli`:** the `flight` command (`flight ask`, `flight retro`, `flight seed`), over a read-only `node:sqlite` connection (ADR 0002) and the Anthropic SDK's tool runner.
- **`data/synthetic/events.jsonl`:** the synthetic data set, one event per line in the format of orc's own export; `flight seed <file>` writes it into a new log.

The packages are one npm workspace, used as source with no build step (ADR 0001).
Node 26 runs the CLI's TypeScript directly; `make setup` installs, `make check` runs the checks and the tests, and `make install` puts `flight` on the PATH.
The CLI is never deployed; it runs only on the owner's Mac.
- **`apps/web`** (from the site change): the public site, built with Astro Starlight and served by one Cloudflare Worker, which from the live change also runs the agent over D1, which is SQLite, so the same queries run in both places.

## What must always hold

The repository follows the owner's `AGENT-APPS.md` and `TYPESCRIPT.md` standards; these are the rules that matter most here.

- **Read-only.** Flight Recorder never writes to the event log or the factory.
  A proposal is something the owner reads and acts on, and the owner merges every factory change.
- **Grounded.** Every claim cites event ids or delivery ids, with counts.
  The core checks every citation before an answer is shown: each cited id exists and came from a tool in that same answer, or, in a retro, from the data the core sent.
  When the data is too thin, it says "not enough data yet" and what it would need.
- **Untrusted text.** Friction notes, change names, a visitor's question and the model's own replies are data, never instructions.
- **Versions are compared, not guessed.** Every event names the factory version that produced it, and that is how Flight Recorder measures whether a factory change helped.
- **Private stays private.** The live log names folders on the owner's Mac and holds free-text notes, so the live log is never published, and only what a question needs goes to the model provider (ADR 0003).
  Tool results and a retro's data give each project as the last segment of its folder path, never the full path; friction notes are sent as they are.
  Only the published data set reaches the site or this repository.
- **Spending is capped in code.** Every model call has a timeout and an output cap; from the live change on, a daily spending cap is checked before each call.

## Tests and evals

- `make check` runs the tests, which never call a live model.
  They use recorded replies to check the tools, the citation check, the "not enough data" rule, the limits, the schema for replies, and the injection guards.
- `make eval` (from a later change) runs the live model against the published data set and prints a score for each kind of case beside the last run's: known answers, questions it should decline, citations that must match rows, and injection attempts.
  It never blocks a change.
- `make record` records the replies the tests use again, and notes the model they came from and when.
  The cases that test the citation check, the cap on calls, the timeout, the reply's schema and the injection guards are written by hand and never re-recorded.

## The published data set

Until the factory has enough real deliveries, the data set is synthetic: shaped exactly like the real log, with made-up project names.
Once Flight Recorder has been through enough deliveries of its own, the data set becomes a curated export of those deliveries:

- only events whose project is Flight Recorder itself;
- the project column becomes the project's name, and any path in a friction note goes through the factory's own filter;
- the owner reads and approves each export before it is committed.

Each event links to the pull request it came from, so a visitor can go from an answer to the real spec, findings and decisions behind it.

## The public site

The site is the public face of both the factory and Flight Recorder.
It stands alone on Cloudflare: nothing in it reaches the owner's Mac, the live log or the factory.

### What it holds

- **The concepts,** one short page each: the stages and gates, builders and reviewers from different vendors, acceptance tests frozen before the build, reviews that break the code on purpose, escalations, the pull request as the record, the event log, and the evals.
  Each page links to the events and pull requests that show it happening.
- **Stories:** the factory finding its own problems, from a friction note to a fix and an ADR, told without naming private projects.
- **The timeline** of the published deliveries, each linking to its pull request.
- **The live part,** from its own change: a visitor asks questions, starting from suggested ones, and watches a retro run step by step.
  Approving or rejecting a proposal changes only that visitor's own session.
  Every answer links to the events it used, on the timeline, and the page says its answers are written by a model.

### How it looks

The look comes from an established, well-maintained design system, not from agents designing pages.

- The site is built on Astro Starlight: a static site framework with a finished design, navigation, search, dark mode and accessibility already done.
- Agents write content and place the framework's own components; they write no layout and no CSS beyond the theme's settings: the accent colour, the logo and the fonts.
- The interactive parts, the timeline and the questions, are components inside its pages, styled only with its theme's tokens.
- The owner judges a change by its content and whether it works, not by its pixels; a look the framework cannot give is left out, not built by hand.

### Spending

The live part keeps spending capped, whoever visits:
  - answers to the suggested questions, and the retro, are worked out once and served as they are;
  - live questions go through Cloudflare's AI Gateway, which caches repeats and logs spending;
  - each visitor is rate-limited, Turnstile keeps bots out, and a daily budget stops live answers once spent, leaving the prepared ones.
- A visitor's question is untrusted like everything else, and the site has no write tools and only published data, so the worst case is an answer outside scope.

It deploys from its own repository through GitHub Actions, as the factory's deploy path sets out: a preview for each change, production on a release.

## The changes, in order

1. **`flight ask`:** grounded answers over the factory's log, read-only, or another log with `--log`, with the synthetic data set and `flight seed`, and the core as its own package.
2. **`flight retro`:** a retro over the last 5 accepted changes, or those since a date, including the friction notes; it keeps no record of its own.
3. **Proposals:** one per retro, opened as a GitHub issue on the factory repository from the CLI; its effect is reported after the next 5 changes.
4. **The curated export** of Flight Recorder's own deliveries, which the owner approves.
5. **The site:** the concept pages, the stories and the timeline, static, on Cloudflare, on the exported data.
6. **The live part:** `ask` and the retro on the site, with the spending caps.

## Decided

- Stack: TypeScript, so the CLI and the Worker share the core.
- Models: `claude-sonnet-5-5` for the CLI; `claude-haiku-5-5` for the site's live questions, with its daily cap set by the owner in the live change.
- The site's look: Astro Starlight's design, with only its theme settings changed; a framework is heavier than `UI.md`'s default, and it is chosen so no one designs pages by hand.
- No separate telemetry service: the factory's SQLite log is enough.

## Not yet

- Grouping review findings by kind: the log keeps only counts.
  It needs a category on review events, which is a factory change of its own.
- Reading the findings on pull requests through `gh`, read-only, which would give the retro the words behind the counts.
- Opening proposals as pull requests against the factory: issues first, pull requests once issues prove useful.
