---
title: flight propose
status: approved
size: full
criteria:
  - id: AC18
    kind: new
    text: "With 2 or more changes covered and at least one cause printed under `## Causes that repeat`, `flight propose` (taking `--since <YYYY-MM-DD>` and `--log <file>` as `flight retro` does) prints on stdout exactly what `flight retro` prints for the same log and first reply, then sends exactly one more request to the model, offering no tools, and when its reply passes the checks of AC19 and AC20 prints `## Proposal: <title>`, then `The problem: <problem>`, `The change: <change>`, and `Rests on (<n> changes, <m> events): ` followed by every id the proposal cites, with n and m counted by the code from its cited ids as for a cause; it sends 2 requests in all."
  - id: AC19
    kind: new
    text: "When the proposal cites nothing or cites an id that no printed cause cites, when its reply is not in the expected form or stopped at the output cap, or when no reply arrives within the timeout (120 seconds by default), `flight propose` still prints the retro but no `## Proposal`, asks no question, runs no command, says on stderr `proposal withheld: <ids>`, `proposal withheld: it cited nothing`, `stopped: the model's reply was not in the expected form` or `stopped: no answer within <s> seconds`, and exits 1."
  - id: AC20
    kind: new
    text: "Before printing a proposal, `flight propose` withholds it, printing no `## Proposal`, asking no question, running no command and exiting 1, when its title, problem or change holds, checked in this order with the first found reported on stderr: the name of a covered change as a whole word in any case (`proposal withheld: it names <name>`); the last path segment of any project in the log, covered or not, as a whole word in any case (`proposal withheld: it holds private detail: the project <segment>`); a filesystem path, that is `/`, `~/` or `./` at the start of the text or after whitespace or one of `(`, `[`, `\"`, `'` or a backtick, followed by a letter, digit, `.`, `-` or `_`, or `/Users/`, `/private/` or `/home/` anywhere (`proposal withheld: it holds private detail: a path`); or an email address (`proposal withheld: it holds private detail: an email address`). A `/` inside a word, such as `and/or`, is not a path."
  - id: AC21
    kind: new
    text: "When the retro prints no cause (fewer than 2 changes covered, the reply says there is not enough data, no cause is left after the checks, or any failure of AC13), `flight propose` sends no second request, asks no question and runs no command; it prints what `flight retro` prints, adds `not enough data yet: a proposal needs at least one cause that repeats` when `## Causes that repeat` was printed with no cause, and exits as `flight retro` would. When the proposal's reply says the causes cannot support a proposal, it prints `not enough data yet: ` followed by what the reply says it would need, asks no question, runs no command, and exits 0."
  - id: AC22
    kind: new
    text: "After printing a proposal at a terminal, `flight propose` writes `Open this proposal as an issue on richardkdrew/agentic-orc-factory? [y/N] ` to stderr and reads one answer; only `y` or `yes`, in any case and with spaces around it ignored, opens the issue. On any other answer it runs no command, writes `not opened` to stderr and exits 0; with no terminal it asks nothing, runs no command, writes `not opened: confirm at a terminal to open it as an issue` to stderr and exits 0."
  - id: AC23
    kind: new
    text: "On `y` or `yes`, `flight propose` runs exactly one command, `gh` with the arguments `issue create --repo richardkdrew/agentic-orc-factory --title <title> --body-file -`, where `<title>` is the proposal's title on one line with control characters removed, and the command's standard input is exactly the proposal's section as printed on stdout, without its `## Proposal: <title>` line and without the blank lines that start and end it; when `gh` exits 0 it prints `opened: ` and the first line `gh` wrote to its stdout, on stdout, and exits 0; when `gh` is not found, exits non-zero or runs for more than 60 seconds, it says `stopped: could not open the issue: ` and why on stderr, and exits 1."
  - id: AC24
    kind: new
    text: "`flight propose` keeps no record of its own: the log's bytes are identical after it runs, it creates no file in `$HOME`, in `$XDG_STATE_HOME` or in the log's folder (other than the `-wal` and `-shm` files SQLite leaves beside the log), and neither request it sends holds a project's full folder path, only its last segment."
  - id: AC26
    kind: existing
    text: "`flight retro` still sends exactly one request, offering no tools, asks no question and runs no command; on AC12's log and reply it still prints the same 4 causes, with the same text and counts in the same order."
questions:
  - id: Q1
    question: "Is `richardkdrew/agentic-orc-factory` public, and what may an issue there hold? The model writes the proposal from your private log, which names your private projects and changes and holds your friction notes."
    recommendation: "Treat it as public: the prompt asks for a proposal that names no project or change and quotes no note, the code withholds one that names a covered project or change (AC20), and you read the exact title and body before you confirm; if the repository is private, AC20 can go and the issue can say which changes it rests on."
    answer: "It is private today, but treat it as public, since it may go public later: keep AC20."
  - id: Q2
    question: "May `flight propose` open the issue through the `gh` CLI, which needs `gh` installed and logged in on your Mac, rather than through GitHub's API with a token Flight Recorder reads from the environment?"
    recommendation: "`gh`: it uses the login you already have, adds no npm dependency, and keeps any GitHub token out of Flight Recorder; if `gh` is missing the proposal is still printed for you to copy."
    answer: "Accept the recommendation: use `gh`."
---

# flight propose

## What

`flight propose` runs the retro you know from `flight retro`, prints it, and then drafts one improvement proposal for the factory from the causes it printed, citing the events it rests on, and prints that too.
It then asks whether to open the proposal as an issue on `richardkdrew/agentic-orc-factory`, and opens it, exactly as printed, only when you answer yes; a proposal that names a change or a project in the log, or holds a path or an email address, is withheld before it is printed.
The retro's prompt now tells the model to claim a pattern only for the changes it cites and how to read the tests and stops (issue #12), since the proposal rests on that text; a recorded retro case checks it, and you judge it by running the retro on the real log before and after.

## Approach

**Shape** (ADR 0004 for the retro, ADR 0007 for the proposal).
The retro keeps no record, so `flight propose` runs the retro itself, with the same `--since` and `--log`, and prints it exactly as `flight retro` does; you then see the very causes the proposal rests on, in the same output.
With at least one cause printed, the core makes one more model call, with no tools, through the same `ModelRunner`.
This is the lightest shape that meets "after a retro" without storing anything: a proposal needs the causes, the causes need the retro's call, and the alternatives (a retro that writes a file, or a propose that reads the retro's Markdown back) would add state or parse untrusted text.
It follows `AGENT-APPS.md` sections 1, 3, 4, 6 and 8: every cited id checked, data inside delimiters, a prompt file with its hash recorded, a reply parsed with a schema and never repaired, a timeout and an output cap, and a filter in code on what is published.

**The proposal call.**
The prompt is a new file, `packages/core/prompts/propose.md`, exported as `PROPOSE_PROMPT_URL`, read by the CLI and hashed like the others; `scripts/build-dist` already copies the whole prompts folder.
It describes the factory as `retro.md` does and asks for the one change to the factory (an agent's brief, a rule, a limit, a gate or an `orc` command) that would most reduce the causes, citing the events it rests on, with no counts in the text, claiming the problem only for the changes it cites, naming no project or change and quoting no friction note; a title of at most 80 characters, a problem of at most three sentences and a change of at most four.
The user message holds, inside `<proposal>` delimiters and after a line saying it is data, one JSON object: the number of changes covered, the causes as printed (text, cited ids, changes, events), and every event those causes cite, in the tools' event shape, friction notes with `printed_under`.
The model is `MODEL` (`claude-sonnet-5-5`), with a question's limits: 120 seconds and `DEFAULT_LIMITS.outputTokens` (4,096); `deps.limits` overrides both calls.
The reply is one JSON object parsed with Zod: `{"kind":"proposal","title":"…","problem":"…","change":"…","cites":["<id>",…]}`, the title 1 to 120 characters, or `{"kind":"not_enough_data","needs":"…"}`; a reply with `stop_reason` `max_tokens` is a bad reply, as in the retro.

**The checks** (AC19, AC20), in this order, the first that fails withholding the proposal:

1. It cites at least one id, and every id it cites is one a printed cause cites.
2. Its title, problem and change hold no private detail (F1), the repository being private today but treated as public (Q1); each kind is looked for in all three fields before the next kind, and the first found is reported:
   1. a covered change's name, as a whole word, compared in any case, a word's edges being anything but a letter, digit, `-` or `_`: `it names <name>`;
   2. the last path segment (`projectName()`) of any project in the log, as a whole word in the same way: `it holds private detail: the project <segment>`; the projects come from one new fixed query, `SELECT DISTINCT project FROM events WHERE project IS NOT NULL`, over the whole log rather than the retro's window, and are used only in code, never sent to the model;
   3. a filesystem path: `/`, `~/` or `./` at the start of the field or after whitespace, `(`, `[`, `"`, `'` or a backtick, followed by a letter, digit, `.`, `-` or `_`; or `/Users/`, `/private/` or `/home/` anywhere, as written: `it holds private detail: a path`;
   4. an email address: one or more letters, digits, `.`, `_`, `%`, `+` or `-`, then `@`, then one or more labels of letters, digits or `-` joined by `.`, ending in `.` and two or more letters: `it holds private detail: an email address`.

   The stderr line names the kind, and only a change's or project's own name, so a full path or an address found is not repeated.
   These checks catch the private detail that has a shape; your reading the proposal before you confirm remains the last check.

**What is printed** (AC18), after the retro, with ids in full:

```markdown
## Proposal: Tell the owner when a run stops for them

The problem: rule stops waited overnight on the owner, who did not see them until the morning.

The change: have `orc` send a desktop notification when a run stops for the owner.

Rests on (3 changes, 4 events): `da64…`, `2b00…`, `…`

Drafted by Flight Recorder (`claude-sonnet-5-5`, prompt `3f1c9a…`) from a retro of 5 changes accepted 2026-11-20 to 2026-11-27; the ids are events in the factory's log.
```

Model text goes through `markdownText()`; the issue's title is the title with control characters removed and newlines as spaces, not escaped, since GitHub does not render a title as Markdown.
The issue's body is the printed section without its heading line, so what you read is what is posted.
Then, on stderr, the record line for each model call, as now (the retro's first), then the question.

**Confirming and opening** (AC22, AC23; ADR 0007; Q2).
At a terminal, the CLI asks on stderr and reads one line; `y` or `yes` (trimmed, any case) runs `gh issue create --repo richardkdrew/agentic-orc-factory --title <title> --body-file -` with no shell, the body on stdin and a 60-second `AbortSignal`, and prints `opened: <url>` on stdout from the first line of `gh`'s stdout.
Anything else prints `not opened`; no terminal prints `not opened: confirm at a terminal to open it as an issue` without asking.
The repository is a constant in the CLI, `FACTORY_REPO`, with no flag to change it.
Ctrl-C while it asks prints `stopped: cancelled`, opens nothing and exits 130.
`apps/cli/src/main.ts` provides the two new dependencies: the answer, from `node:readline/promises` on `process.stdin` when it is a TTY, and the command runner, from `node:child_process` `spawn` with `shell: false`; both are optional in `CliDeps`, and when either is absent the CLI treats it as no terminal and runs nothing, so a test that does not pass them can never run `gh`.

**Issue #12: claims no wider than the cited changes.**
`packages/core/prompts/retro.md` gains three rules, and nothing in the retro's code changes:

- Claim a pattern only for the changes whose events you cite, and never write `every`, `all` or `most` unless the events you cite show it.
- The test agent writes the acceptance tests against a skeleton before the build, so checks that fail before a change's first `engineering` agent run are expected and are not a cause.
- A stop is the event that ended the run before one of the owner's answers: the latest escalation since the previous answer, or else the last command that finished; say a run stopped at the tests, a rule or the review only when that event shows it, and read `allowed past review` as findings the owner let through, not findings cleared.

These rules are about what the events mean, which only the model reads, so they are checked by the recorded case below and by your run of `flight retro` on the real log before and after, as the issue asks; they are not acceptance criteria.
No earlier criterion is replaced: the retro's acceptance tests use hand-written replies, so a prompt change leaves them as they are (AC26).

**A recorded retro case** (issue #12).
`apps/cli/tests/recordings/retro-claims-only-what-it-cites.json` is the first retro case: `replay.ts`'s `Recording` gains `command` (`ask` by default, or `retro`), `question` becomes optional, its outcomes gain the retro's, and a retro case carries `events`, its own small synthetic log; `recordings.test.ts` replays a retro case with `flight retro --log`, and `make record` (`apps/cli/tests/record.ts`) re-records retro cases through `retro()` on that log.
Its log has 4 accepted changes: two that waited more than 10 hours on the owner, two whose every wait was under an hour, one rule stop, and one change whose checks failed before its first build, on the test agent's skeleton.
The test checks that it ends as recorded, that no cause whose text says `hour` cites an event of either change that waited under an hour (the issue's "hours" example), that no cause whose text says `test` cites the rule stop, and that no cause cites the checks before the first build.
It starts in recorded form written by hand (`hand_written: false`, `recorded_at: null`), with a reply that passes; when you run `make record`, a live reply that overstates as the issue's examples did fails `make check`.

**Code**: `propose(deps, options)` in `packages/core/src/propose.ts`, returning the retro's `RetroResult` and, when a second call was made, the proposal or its failure; `renderProposal()` in the core, giving the printed section and the issue's title and body, so the site can reuse both; `runCli` gains `propose`, `--since` is accepted by `retro` and `propose` only, and `USAGE` lists it.
The proposal's counts reuse the retro's: n is the covered changes its ids belong to, m its distinct event ids.
No new dependency and no change to any manifest or lock file; `node:child_process` and `node:readline/promises` are Node built-ins, used only in `apps/cli`.
`docs/ARCHITECTURE.md` names `flight propose`, the proposal call and the one write it may make.

**Test seams**:

- `runCli(["propose", "--log", path], deps)` and `runCli(["propose", "--since", "2026-11-01", "--log", path], deps)` from `apps/cli/src/cli.ts`, with `deps.fetch` a replay of two hand-written replies (the retro's, then the proposal's, or `{"hang": true}`), `deps.limits` for a short timeout, and two new optional fields:
  - `deps.answer: (signal) => Promise<string | null>`, your one line, or null when there is no terminal;
  - `deps.run: (file, args, input, signal) => Promise<{ kind: "exited", code, stdout, stderr } | { kind: "not_found" }>`, a fake that records each call.
- `runCli(["retro", "--log", path], deps)` with the same fakes, for AC26.
- `propose(deps, options)` and `renderProposal(proposal)` from `@flight/core`.
- The acceptance tests build their own logs through `node:sqlite` with the schema in `docs/ARCHITECTURE.md`, reusing `acceptance/fixtures/retro.ts`, as the flight-retro tests do; AC20 has a case for each kind, each in a different field and case where it applies: a covered change's name, a covered project's segment, the segment of a project with events only before `--since`, a path starting `/`, `~/` and `./`, `/Users/` inside a word, and an email address, with a proposal holding `and/or` that is still printed; AC24 checks files as AC8 does, and AC23's `gh` timeout uses a fake that never settles until its signal aborts.

## Out of scope

- Reporting a proposal's effect after the next 5 changes: a change of its own.
- Opening proposals as pull requests, labels on the issue, or any repository other than `richardkdrew/agentic-orc-factory`.
- Any write to the event log, or to the factory other than the one issue.
- `--json`, a `--yes` flag, or more than one proposal per run.
- A check in code on the words a cause, went-well item or proposal uses (the owner dropped it: it catches none of issue #12's real examples and would drop good text).
- Changes to `flight ask`'s code or prompt, or to the retro's code or change sections.

## Assumptions

- `flight propose` prints the whole retro first, so a proposal costs two model calls, about twice a retro; the request's "after a retro" and the retro keeping no record leave no lighter way to show the causes it rests on.
- The issue is opened by the CLI's code after your answer, never by the model, which still has no tool that writes; ADR 0007 records it, and `docs/ARCHITECTURE.md`'s "Read-only" names this one write.
- F1 changes the filter ADR 0005 decided, so ADR 0007 supersedes it, as my brief requires for a changed decision; ADR 0006, which the last revision meant to remove, is still in the repository, and since I can only add ADRs it is marked superseded by 0007 as well; 0005 and 0006 change only in their status line.
- A covered project's name, which the last revision reported as `it names <name>`, is now reported as private detail, since F1 lists every project in the log under that message; a change's name keeps `it names <name>`.
- The project check reads every project in the whole log, not only those since `--since`, as F1's "any project in the log" says; it costs one more fixed query and sends nothing more to the model.
- A path is only what F1 describes: a relative path such as `packages/core/prompts/retro.md` or `../x` is not withheld, and `/` after whitespace starts a path, so a proposal that writes ` /retro` is withheld and can be run again.
- The repository is a constant, since the request names it and there is one factory.
- The proposal may cite only ids a printed cause cites, so it rests on causes that passed the retro's checks; a delivery id a cause cites counts as its change, as in the retro.
- The criterion that checked the words (AC25) is dropped and its id is not reused, so AC26 keeps its id and the owner's and reviewer's references stay valid.
- Issue #12 is kept to the prompt's rules, the recorded case and your run on the real log before and after, as you asked; how widely a cause claims a pattern is then not checked in code, and you read every proposal before confirming it.
- The name checks (AC20) compare whole words, so a change called `fix` blocks "a fix" in any case but not "prefix"; they also block a public project's name, such as Flight Recorder's own folder name.
- F2: the recorded retro case stays as described above; a hand-written reply cannot test the model, so it is checked when `make record` re-records it.
- The answer is read only from a TTY; piped input counts as no terminal, so a script can never confirm.
- `gh` has 60 seconds, a timeout of its own outside the model's, since it is a network call to another service.
- I could not check `gh`'s documentation in this session: I assume `--body-file -` reads the body from standard input, that `gh issue create` asks nothing when given a title and body, and that it prints the issue's URL on its first line of stdout; the engineer checks these on setup.
- The retro prompt changes without an eval run, since `make eval` does not exist yet; your run on the real log before and after stands in for it, as the issue says.
- The record line for each model call keeps its current form, one line per call, the retro's first.

## Later

- Reporting a proposal's effect after the next 5 changes, and a field in the proposal for what should change in those changes' events.
- A label on proposal issues so the effect report can find them.
- An allow-list of public project names for the name check.
- Opening proposals as pull requests against the factory, once issues prove useful.
