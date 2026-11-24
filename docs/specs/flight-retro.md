---
title: flight retro
status: draft
size: full
criteria:
  - id: AC6
    kind: new
    text: "`flight retro` covers the 5 changes accepted most recently, a change being accepted when its delivery has an `orc.owner.decided.v1` with decision `accepted`, at the time of its latest such event; a delivery with no decision `accepted` (such as one with only `merged`, `sent back` or `orc.owner.judged.v1` verdicts) gets no section. It prints Markdown to stdout with one section per covered change, oldest acceptance first, headed `## <change> (<project>)` with the project's last path segment, and with fewer than 5 accepted changes it covers them all."
  - id: AC7
    kind: new
    text: "`flight retro --since <YYYY-MM-DD>` covers, instead of the last 5, every change whose latest acceptance is at or after the start of that day in UTC, up to the 20 most recent; a `--since` value that is not a date in that form exits 2 with a usage error and sends no request to the model."
  - id: AC8
    kind: new
    text: "`flight retro` keeps no record of its own: the log's bytes are identical after it runs, it creates no file in `$HOME`, in `$XDG_STATE_HOME` or in the log's folder (other than the `-wal` and `-shm` files SQLite leaves beside the log), two runs on the same log cover the same changes, and no request it sends to the model holds a project's full folder path, only its last segment."
  - id: AC9
    kind: new
    text: "Each change's section has a table with the columns `Stop | Event | Your answer | Event | Waited` and one row per `orc.owner.decided.v1` (other than decision `merged`) or `orc.owner.judged.v1` of that delivery, in time order. When an `orc.run.escalated.v1` of the delivery falls after the previous answer and before this one, the Stop is `escalated: <kind> (<count>)` with the latest such event's id; otherwise it is `<command> ended: <outcome>` from the delivery's last `orc.command.finished.v1` before the answer, with its id. Your answer is the decision or verdict as the log holds it, with its event id, and Waited is the whole minutes from the stop event to the answer, as `<m> min` or `<h> h <m> min`."
  - id: AC10
    kind: new
    text: "Each change's section has the line `build attempts: <a>, spec review rounds: <s>, code review rounds: <c>, rule stops: <r>, timeouts: <t>`, where a counts the delivery's `orc.agent.finished.v1` with agent `engineering`, s and c its `orc.review.recorded.v1` of kind `spec` and `code`, r its `orc.run.escalated.v1` of kind `rules`, and t its `orc.agent.finished.v1` with outcome `timed out`."
  - id: AC11
    kind: new
    text: "Every `orc.friction.noted.v1` from the start of the range (the earliest event of the changes covered, or the `--since` day) to the end of the log is printed exactly once, as a list item with its note on one line and its event id: under the covered change of the same `project` value whose latest event at or before the note is the latest; when the note has no project or no covered change of its project has an event at or before it, under `## Other friction notes`, after the changes."
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
  - id: AC16
    kind: new
    text: "In `data/synthetic/events.jsonl`, every `orc.owner.decided.v1` decision is one of `approved`, `answered`, `reopened`, `allowed`, `allowed past review`, `sent back`, `corrected tests`, `accepted`, `released` or `merged`; every `orc.owner.judged.v1` verdict is `works` or `problems`; every `orc.run.escalated.v1` kind is `build attempts`, `rules`, `review rounds` or `frozen tests`; every `orc.agent.finished.v1` outcome is `succeeded`, `failed` or `timed out`; every `orc.command.finished.v1` outcome is `succeeded` or `stopped`; every `orc.deploy.finished.v1` outcome is `succeeded` or `failed`; every `orc.review.recorded.v1` verdict is `pass` or `changes_requested`; no `orc.friction.noted.v1` has a delivery; and every event id the file held before this change is still in it with the same type, time, project, change and delivery."
  - id: AC17
    kind: new
    text: "After `flight seed <file>`, `flight retro --log <file>` prints sections for exactly `reading-stats (paper-lantern)`, `tide-alerts (tide-tables)` and `dark-mode (paper-lantern)`, in that order, and none for `station-search`, `import-bookmarks` or `offline-cache`; tide-alerts' table has the row Stop `escalated: rules (1)`, Event `da640d83103eb43bedc8dd972aa6cdca`, Your answer `allowed`, Event `3db783e8a6f63e9271adb1a7a539c903`, Waited `18 h 39 min`, its counts line has `rule stops: 1`, the note `2b00fbfddd465d1e8b9d3f19445dc37e` is listed under it, and the note `6e92651aa7daee50ce0f553c5c3b4976` is under `## Other friction notes`."
questions:
  - id: Q1
    question: "Friction notes in the log carry no delivery (and sometimes no project), but you want each change's notes beside it. How should a note find its change?"
    recommendation: "Put a note under the covered change of the same project that was active most recently at or before the note, and any note that matches no change under `## Other friction notes`; it fits how notes are written now (just after a change ends) and never hides a note."
    answer: "Accepted. Friction notes never carry a delivery, so the project-and-time rule is the only rule."
  - id: Q2
    question: "Should the causes that repeat and what went well be written by the model, or counted by code from the stop kinds alone?"
    recommendation: "The model, in one call of about a few cents per retro over the same events the change sections show: only a model can tie a free-text friction note to the stops it explains, and the code still counts each cause's changes and events and checks every id it cites."
    answer: "Accepted."
---

# flight retro

## What

`flight retro` prints a Markdown retro of the last 5 accepted changes, or of every change accepted since a date with `--since <YYYY-MM-DD>`, from the factory's event log, which it only reads; it keeps no record of its own.
For each change it shows where the run stopped and why, how you answered each stop and how long it waited, the counts of build attempts, review rounds, rule stops and timeouts, and the friction notes that belong to it.
It ends with the few causes that repeat across those changes, most frequent first, each with its counts and the event ids it rests on, and what went well.
The synthetic data set changes to the values orc's real log holds, so `flight seed` then `flight retro` shows what the real log would.

## Approach

**Shape** (ADR 0004).
The change sections are facts the code builds from fixed queries; the model writes only the causes and what went well, in one call with no tools, over the events those sections were built from.
This is lighter than running the `ask` agent loop: the retro already knows which events it needs, so the model has nothing to look up, the request is one bounded call, and the sections stay exact whatever the model does.
It follows `AGENT-APPS.md` sections 1, 3 and 6 (every cited id checked, the data inside delimiters, a reply parsed with a schema, a timeout and an output cap) and departs from `docs/ARCHITECTURE.md`'s "the model chooses which queries to run" for the retro only, as ADR 0004 records.

**The values** are those orc's real log holds, now listed in `docs/ARCHITECTURE.md`'s table of event types.
A change is accepted when its delivery has an `orc.owner.decided.v1` with decision `accepted`.
`merged` comes from changes merged before orc had an accept step: it never makes a change accepted, and the retro gives it no row.
`orc.owner.judged.v1` verdicts (`works`, `problems`) are rows of the table but never make a change accepted.

**The range.**
By default the retro covers the 5 deliveries with the latest acceptance; with `--since <YYYY-MM-DD>`, every delivery accepted at or after that UTC day starts, at most the 20 most recent, and the heading says when it left older ones out.
The range starts at the earliest event of the covered deliveries, or at the `--since` day, and runs to the end of the log, which is where friction notes are taken from.
Nothing is stored: "since the last one" is always recomputed from the log, so two runs on the same log give the same range.
The queries are new fixed SQL in the core with numbered parameters, `json_each` for lists and `julianday()` for times, as `AGENTS.md` asks, so they run on D1 unchanged.

**A change's section** (AC9 to AC11), as the seeded synthetic log gives it:

```markdown
## tide-alerts (tide-tables)

Delivery `32f8…`, accepted 2026-11-11 (`b6de…`).

build attempts: 2, spec review rounds: 0, code review rounds: 2, rule stops: 1, timeouts: 0

| Stop | Event | Your answer | Event | Waited |
|---|---|---|---|---|
| escalated: rules (1) | `da64…` | allowed | `3db7…` | 18 h 39 min |
| build ended: succeeded | `d30d…` | accepted | `b6de…` | 2 h 13 min |

Friction notes:

- the dependency escalation waited overnight because I did not see it until the morning (`2b00…`)
```

Ids are printed in full (shortened here only).
A stop with no escalation or command before it shows `(none recorded)` and an empty Event.
Decisions and verdicts are printed as the log holds them (`approved`, `allowed past review`, `sent back`, `accepted`, `works`…).
Change names and notes are untrusted text: control characters are removed, newlines become spaces and `|` is escaped in table cells.
The output starts with `# Retro: <n> changes accepted <first date> to <last date>`.

**Friction notes** (AC11, Q1): notes never carry a delivery, so a note goes under the covered change of the same raw `project` value whose latest event at or before the note is the latest; otherwise under `## Other friction notes`.

**The causes** (AC12 to AC14).
With 2 or more changes covered, the core sends one request through the same `ModelRunner` with `tools: []`, so it makes one model call and the core still does not import the SDK (ADR 0001).
The model is `MODEL` (`claude-sonnet-5-5`), with the existing limits: 120 seconds and 4,096 output tokens.
The prompt is a new file, `packages/core/prompts/retro.md`, read by the CLI and hashed like `ask.md`; `scripts/build-dist` already copies the whole prompts folder.
The prompt names the values above, so the model reads `rules`, `build attempts` and `timed out` as the stops they are.
The user message holds, inside `<retro>` delimiters and after a line saying it is data, one JSON object: each covered change (delivery id, change, project as its last segment, accepted time, and all its events in the tools' event shape) and the friction notes in the range, each with the delivery it is printed under or `null`.
The prompt asks for causes that repeat across at least 2 changes and what went well, citing every event each rests on, with no counts in the text, since the code adds them.
The reply is one JSON object parsed with Zod, rejected and never repaired when it does not fit: `{"kind":"retro","causes":[{"text":"…","cites":["<id>",…]}],"went_well":[{"text":"…","cites":[…]}]}`, at most 5 of each, or `{"kind":"not_enough_data","needs":"…"}`.
The citation check: every cited id must be an event id or a delivery id in the data sent, and every cause and item must cite at least one; one failure withholds both sections.
The code counts each cause: n is the number of covered changes its cited ids belong to, m the number of distinct event ids it cites; causes with n below 2 are dropped, and if none is left the section says `No cause repeats across these changes.`.
Each cause is printed as a numbered item: its text, `(<n> changes, <m> events)`, and its ids in backticks.

**Output and exit codes**, as `flight ask` does them: the Markdown on stdout; `causes withheld:`, `stopped:` and errors on stderr, the change sections still on stdout; the one record line on stderr after a model call (model, prompt hash, calls, tokens, seconds, `tools=none`, outcome); 0 for a retro or "not enough data yet", 1 for an expected failure (no log, no API key, withheld, timeout, bad reply, model error), 2 for a usage error, 130 for Ctrl-C.
The API key is checked as `ask` checks it, before anything is printed.

**The synthetic data set** (AC16, AC17): `data/synthetic/events.jsonl` keeps every event and id it has, with these values changed:

- decisions `approve` → `approved`, `send_back` → `sent back`, `allow` → `allowed`, `accept` → `accepted`;
- verdicts of `orc.owner.judged.v1` `accepted` → `works` (station-search, import-bookmarks) and `sent_back` → `problems` (offline-cache);
- escalation kinds `attempts` → `build attempts`, `dependency` → `rules`;
- agent outcomes `ok` → `succeeded`; command outcomes `ok` → `succeeded`, `escalated` → `stopped`; deploy outcomes `ok` → `succeeded`;
- review verdicts `approve` → `pass`, `changes` → `changes_requested`.

The three older deliveries (station-search, import-bookmarks, offline-cache), which were judged after their merge, each gain one `orc.owner.decided.v1` with decision `merged`, a new 32-character hex id, the fields the other decisions have (`version` `"1"`, their last commit), placed between their last command and their verdict, so the file stays in time order.
`flight ask`'s code and prompt do not change; its tests compute what they expect from the file, and its recorded cases cite ids that stay.

**Code**: `retro(deps, { since? })` in `packages/core/src/retro.ts`, returning a `Result` whose value and error both carry the change sections' facts; `renderRetro` in the core turns them into Markdown, so the site can reuse both; `runCli` gains `retro` and a `--since` option that only `retro` accepts.
No new dependency and no change to any manifest or lock file.

**Test seams**:

- `runCli(["retro", "--log", path], deps)` and `runCli(["retro", "--since", "2026-11-01", "--log", path], deps)` from `apps/cli/src/cli.ts`, with `deps.fetch` a replay of hand-written recordings (one response body, or `{"hang": true}`) and `deps.limits` for a short timeout; the replay keeps each request body, so a test can check there was one request, with no tools and no full path.
- `retro(deps, options)` and `renderRetro(result)` from `@flight/core`.
- The acceptance tests build their own small logs through `node:sqlite` with the schema in `docs/ARCHITECTURE.md`, as the flight-ask tests do; AC17 seeds one with `flight seed` and answers the one model request with a hand-written `not_enough_data` reply.
- AC16 reads `data/synthetic/events.jsonl` directly, and compares it with a list, kept in the test, of the 78 events' ids, types, times, projects, changes and deliveries as the file holds them before this change.

## Out of scope

- Proposals, and opening them as issues: the next change.
- Reading review findings or decisions in words from pull requests.
- Post-merge problems (`orc.problem.reported.v1`), costs, and comparing factory versions in the change sections; the model still sees those events and may cite them.
- `--json`, `--until`, a count other than 5, and flags to change the limits.
- Any change to `flight ask`'s code or prompt.

## Assumptions

- A retro's causes and what went well are written by the model (Q2); the change sections never depend on it.
- The model gets no tools in a retro and one call, since the code has already chosen its data; ADR 0004 records this and the data it sends.
- What leaves the Mac is the same kind of data ADR 0003 accepted, the covered changes' events and the friction notes in the range, with projects as their last segment; ADR 0004 supersedes 0003's "the tool results of that question" to cover it.
- `--since` with more than 20 accepted changes covers the 20 most recent, which bounds the request at roughly 50,000 input tokens.
- A stop is whatever came before each answer of yours; review rounds that asked for changes and failed checks are counted, not listed, since the factory goes on without you.
- Build attempts are counted as engineering agent runs, which includes runs after a send-back.
- Escalations of kind `frozen tests`, `review rounds` and `build attempts` are shown as stops in the table but not counted as rule stops; only kind `rules` is.
- Timeouts are counted from agents only, since a command's outcome is never `timed out`.
- `answered`, `reopened`, `allowed past review`, `corrected tests` and `released` are rows like any other decision; a change's accepted time is its latest `accepted`, so a `released` after it is still a row.
- The real log's older deliveries record `merged` and then a judged verdict; I could not see the real log, so the synthetic data's added `merged` events follow that order as assumed.
- Deploy outcomes are `succeeded` and `failed`, as the owner confirmed; the synthetic data's six deploys all become `succeeded`, and the flight-ask acceptance fixture's own `ok` deploy is test data the change leaves as it is.
- With the new values the seeded log has 3 accepted changes, so `flight retro` on it makes one model call; the note about import-bookmarks (`f9ff…`) falls before the range and is not printed.
- Times in the table are UTC dates; Waited is rounded down to whole minutes.

## Later

- Post-merge problems and cost per change in each change's section.
- `--json` output for the proposals change and the site.
- Grouping review findings by kind, once review events carry a category.
- Listing each failed check and each review round that asked for changes, not only their counts.
- Naming the real values in `flight ask`'s prompt, so its answers use `accepted` and `merged` as the retro does.
