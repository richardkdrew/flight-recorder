---
title: flight retro
status: draft
size: full
criteria:
  - id: AC6
    kind: new
    text: "`flight retro` covers the 5 changes accepted most recently, a change being accepted when its delivery has an `orc.owner.decided.v1` with decision `accept` or, in older deliveries, an `orc.owner.judged.v1` with verdict `accepted`; it prints Markdown to stdout with one section per covered change, oldest acceptance first, headed `## <change> (<project>)` with the project's last path segment; a change never accepted (such as one only sent back) gets no section, and with fewer than 5 accepted changes it covers them all."
  - id: AC7
    kind: new
    text: "`flight retro --since <YYYY-MM-DD>` covers, instead of the last 5, every change whose latest acceptance is at or after the start of that day in UTC, up to the 20 most recent; a `--since` value that is not a date in that form exits 2 with a usage error and sends no request to the model."
  - id: AC8
    kind: new
    text: "`flight retro` keeps no record of its own: the log's bytes are identical after it runs, it creates no file in `$HOME`, in `$XDG_STATE_HOME` or in the log's folder (other than the `-wal` and `-shm` files SQLite leaves beside the log), two runs on the same log cover the same changes, and no request it sends to the model holds a project's full folder path, only its last segment."
  - id: AC9
    kind: new
    text: "Each change's section has a table with the columns `Stop | Event | Your answer | Event | Waited` and one row per `orc.owner.decided.v1` or `orc.owner.judged.v1` of that delivery, in time order. When an `orc.run.escalated.v1` of the delivery falls after the previous answer and before this one, the Stop is `escalated: <kind> (<count>)` with the latest such event's id; otherwise it is `<command> ended: <outcome>` from the delivery's last `orc.command.finished.v1` before the answer, with its id. Your answer is the decision or verdict with its event id, and Waited is the whole minutes from the stop event to the answer, as `<m> min` or `<h> h <m> min`."
  - id: AC10
    kind: new
    text: "Each change's section has the line `build attempts: <a>, spec review rounds: <s>, code review rounds: <c>, rule stops: <r>, timeouts: <t>`, where a counts the delivery's `orc.agent.finished.v1` with agent `engineering`, s and c its `orc.review.recorded.v1` of kind `spec` and `code`, r its `orc.run.escalated.v1` whose kind is neither `attempts` nor `rounds`, and t its `orc.agent.finished.v1` and `orc.command.finished.v1` with outcome `timeout`."
  - id: AC11
    kind: new
    text: "Every `orc.friction.noted.v1` from the start of the range (the earliest event of the changes covered, or the `--since` day) to the end of the log is printed exactly once, as a list item with its note on one line and its event id: under the covered change whose delivery it names; when it names none, under the covered change of the same project with the latest event at or before the note; otherwise under `## Other friction notes`, after the changes."
  - id: AC12
    kind: new
    text: "With 2 or more changes covered, `flight retro` sends exactly one request to the model, offering no tools; when the reply passes the citation check, the output ends with `## Causes that repeat`, listing only the causes whose cited ids belong to at least 2 covered changes, each followed by `(<n> changes, <m> events)` as the code counts them from its cited ids (a friction note counting for the change it is printed under, a delivery id for its own change) and by every id it cites, ordered by n and then m, largest first; then `## What went well`, each item with the ids it cites; and it exits 0."
  - id: AC13
    kind: new
    text: "When a cause or a went-well item cites nothing or cites an id that is not an event id or delivery id in the data the retro sent, when the reply is not in the expected form, or when no reply arrives within the timeout (120 seconds by default), the change sections are still printed but neither `## Causes that repeat` nor `## What went well` is; stderr says `causes withheld: <ids>` (or `causes withheld: it cited nothing`), `stopped: the model's reply was not in the expected form`, or `stopped: no answer within <s> seconds`; and it exits 1."
  - id: AC14
    kind: new
    text: "With fewer than 2 changes covered, `flight retro` sends no request to the model, prints the sections it has and `not enough data yet: causes need at least 2 accepted changes, and this range has <n>`, and exits 0; when the model's reply says the data cannot support causes, it prints `not enough data yet: ` followed by what the reply says it would need, and exits 0."
  - id: AC15
    kind: existing
    text: "`flight ask \"<question>\" --since 2026-01-01` and `flight seed <file> --since 2026-01-01` still exit 2 with a usage error, send no request to the model and create no file."
questions:
  - id: Q1
    question: "Friction notes in the log carry no delivery (and sometimes no project), but you want each change's notes beside it. How should a note find its change?"
    recommendation: "Put a note under the covered change of the same project that was active most recently at or before the note, and any note that matches no change under `## Other friction notes`; it fits how notes are written now (just after a change ends) and never hides a note."
    answer: null
  - id: Q2
    question: "Should the causes that repeat and what went well be written by the model, or counted by code from the stop kinds alone?"
    recommendation: "The model, in one call of about a few cents per retro over the same events the change sections show: only a model can tie a free-text friction note to the stops it explains, and the code still counts each cause's changes and events and checks every id it cites."
    answer: null
---

# flight retro

## What

`flight retro` prints a Markdown retro of the last 5 accepted changes, or of every change accepted since a date with `--since <YYYY-MM-DD>`, from the factory's event log, which it only reads; it keeps no record of its own.
For each change it shows where the run stopped and why, how you answered each stop and how long it waited, the counts of build attempts, review rounds, rule stops and timeouts, and the friction notes that belong to it.
It ends with the few causes that repeat across those changes, most frequent first, each with its counts and the event ids it rests on, and what went well.

## Approach

**Shape** (ADR 0004).
The change sections are facts the code builds from fixed queries; the model writes only the causes and what went well, in one call with no tools, over the events those sections were built from.
This is lighter than running the `ask` agent loop: the retro already knows which events it needs, so the model has nothing to look up, the request is one bounded call, and the sections stay exact whatever the model does.
It follows `AGENT-APPS.md` sections 1, 3 and 6 (every cited id checked, the data inside delimiters, a reply parsed with a schema, a timeout and an output cap) and departs from `docs/ARCHITECTURE.md`'s "the model chooses which queries to run" for the retro only, as ADR 0004 records.

**The range.**
A change is a delivery; it is accepted at its latest `orc.owner.decided.v1` with decision `accept` or `orc.owner.judged.v1` with verdict `accepted`.
By default the retro covers the 5 deliveries with the latest acceptance; with `--since <YYYY-MM-DD>`, every delivery accepted at or after that UTC day starts, at most the 20 most recent, and the heading says when it left older ones out.
The range starts at the earliest event of the covered deliveries, or at the `--since` day, and runs to the end of the log, which is where friction notes are taken from.
Nothing is stored: "since the last one" is always recomputed from the log, so two runs on the same log give the same range.
The queries are new fixed SQL in the core with numbered parameters, `json_each` for lists and `julianday()` for times, as `AGENTS.md` asks, so they run on D1 unchanged.

**A change's section** (AC9 to AC11):

```markdown
## import-bookmarks (paper-lantern)

Delivery `5ff2…`, accepted 2026-10-13 (`3621…`).

build attempts: 4, spec review rounds: 1, code review rounds: 1, rule stops: 0, timeouts: 0

| Stop | Event | Your answer | Event | Waited |
|---|---|---|---|---|
| design ended: ok | `0417…` | approve | `40bb…` | 24 min |
| escalated: attempts (3) | `5823…` | send_back | `a3bc…` | 20 h 10 min |
| build ended: ok | `30de…` | accepted | `3621…` | 4 h 47 min |

Friction notes:

- the build agent retried the same failing import test three times before it escalated (`f9ff…`)
```

Ids are printed in full (shortened here only).
A stop with no escalation or command before it shows `(none recorded)` and an empty Event.
Decisions and verdicts are printed as the log holds them (`approve`, `allow`, `send_back`, `accept`, `accepted`, `sent_back`).
Change names and notes are untrusted text: control characters are removed, newlines become spaces and `|` is escaped in table cells.
The output starts with `# Retro: <n> changes accepted <first date> to <last date>`.

**Friction notes** (AC11, Q1): a note goes under the covered change whose delivery it names; with no delivery, under the covered change of the same raw `project` value whose latest event at or before the note is the latest; otherwise under `## Other friction notes`.

**The causes** (AC12 to AC14).
With 2 or more changes covered, the core sends one request through the same `ModelRunner` with `tools: []`, so it makes one model call and the core still does not import the SDK (ADR 0001).
The model is `MODEL` (`claude-sonnet-5-5`), with the existing limits: 120 seconds and 4,096 output tokens.
The prompt is a new file, `packages/core/prompts/retro.md`, read by the CLI and hashed like `ask.md`; `scripts/build-dist` already copies the whole prompts folder.
The user message holds, inside `<retro>` delimiters and after a line saying it is data, one JSON object: each covered change (delivery id, change, project as its last segment, accepted time, and all its events in the tools' event shape) and the friction notes in the range, each with the delivery it is printed under or `null`.
The prompt asks for causes that repeat across at least 2 changes and what went well, citing every event each rests on, with no counts in the text, since the code adds them.
The reply is one JSON object parsed with Zod, rejected and never repaired when it does not fit: `{"kind":"retro","causes":[{"text":"…","cites":["<id>",…]}],"went_well":[{"text":"…","cites":[…]}]}`, at most 5 of each, or `{"kind":"not_enough_data","needs":"…"}`.
The citation check: every cited id must be an event id or a delivery id in the data sent, and every cause and item must cite at least one; one failure withholds both sections.
The code counts each cause: n is the number of covered changes its cited ids belong to, m the number of distinct event ids it cites; causes with n below 2 are dropped, and if none is left the section says `No cause repeats across these changes.`.
Each cause is printed as a numbered item: its text, `(<n> changes, <m> events)`, and its ids in backticks.

**Output and exit codes**, as `flight ask` does them: the Markdown on stdout; `causes withheld:`, `stopped:` and errors on stderr, the change sections still on stdout; the one record line on stderr after a model call (model, prompt hash, calls, tokens, seconds, `tools=none`, outcome); 0 for a retro or "not enough data yet", 1 for an expected failure (no log, no API key, withheld, timeout, bad reply, model error), 2 for a usage error, 130 for Ctrl-C.
The API key is checked as `ask` checks it, before anything is printed.

**Code**: `retro(deps, { since? })` in `packages/core/src/retro.ts`, returning a `Result` whose value and error both carry the change sections' facts; `renderRetro` in the core turns them into Markdown, so the site can reuse both; `runCli` gains `retro` and a `--since` option that only `retro` accepts.
No new dependency and no change to any manifest or lock file.

**Test seams**:

- `runCli(["retro", "--log", path], deps)` and `runCli(["retro", "--since", "2026-11-01", "--log", path], deps)` from `apps/cli/src/cli.ts`, with `deps.fetch` a replay of hand-written recordings (one response body, or `{"hang": true}`) and `deps.limits` for a short timeout; the replay keeps each request body, so a test can check there was one request, with no tools and no full path.
- `retro(deps, options)` and `renderRetro(result)` from `@flight/core`.
- The acceptance tests build their own small logs through `node:sqlite` with the schema in `docs/ARCHITECTURE.md`, as the flight-ask tests do.

## Out of scope

- Proposals, and opening them as issues: the next change.
- Reading review findings or decisions in words from pull requests.
- Post-merge problems (`orc.problem.reported.v1`), costs, and comparing factory versions in the change sections; the model still sees those events and may cite them.
- `--json`, `--until`, a count other than 5, and flags to change the limits.
- Any change to the synthetic data set or to `flight ask`.

## Assumptions

- A retro's causes and what went well are written by the model (Q2); the change sections never depend on it.
- The model gets no tools in a retro and one call, since the code has already chosen its data; ADR 0004 records this and the data it sends.
- What leaves the Mac is the same kind of data ADR 0003 accepted, the covered changes' events and the friction notes in the range, with projects as their last segment; ADR 0004 supersedes 0003's "the tool results of that question" to cover it.
- `--since` with more than 20 accepted changes covers the 20 most recent, which bounds the request at roughly 50,000 input tokens.
- A stop is whatever came before each answer of yours; review rounds that asked for changes and failed checks are counted, not listed, since the factory goes on without you.
- Build attempts are counted as engineering agent runs, which includes runs after a send-back.
- I could not verify the outcome value orc records for a timeout; `timeout` is assumed, and AC10 counts only that value.
- I could not verify whether orc's real log ever gives a friction note a delivery or a change; the synthetic data never does, so the project-and-time rule (Q1) is what applies in practice.
- Times in the table are UTC dates; Waited is rounded down to whole minutes.

## Later

- Post-merge problems and cost per change in each change's section.
- `--json` output for the proposals change and the site.
- Grouping review findings by kind, once review events carry a category.
- Listing each failed check and each review round that asked for changes, not only their counts.
