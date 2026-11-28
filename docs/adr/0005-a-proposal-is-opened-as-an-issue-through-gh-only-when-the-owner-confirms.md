# 0005: A proposal is opened as an issue on the factory repository through `gh`, only when the owner confirms it

Status: superseded by 0007
Date: 2026-11-28

## Context

`flight propose` drafts one improvement proposal for the factory from a retro's causes, and the owner wants it opened as an issue on the factory repository, `richardkdrew/agentic-orc-factory`, only when they confirm.
Until now Flight Recorder wrote nothing anywhere: `docs/ARCHITECTURE.md` says it never writes to the event log or the factory.
An issue is a write to GitHub.
The repository is private today, but the owner treats it as public because it may go public later, so an issue may publish text a model wrote from the owner's private log, which names private projects and holds the owner's own friction notes.
`AGENT-APPS.md` asks for an ADR for anything that changes something, and for a filter on anything the app publishes.

## Decision

The CLI opens an issue only after it has printed the proposal in full and the owner has answered `y` or `yes` at a terminal to the question that names the repository.
It runs `gh issue create --repo richardkdrew/agentic-orc-factory --title <title> --body-file -`, with no shell, the body on standard input and a 60-second timeout, so it uses the owner's own `gh` login and Flight Recorder holds no GitHub token.
The issue's title and body are exactly what was printed.
The model has no tool that writes: the issue is opened by the CLI's code, never by the model.
The core withholds a proposal, so it is never offered for opening, when it cites nothing, cites an id no printed cause cites, or names a covered change or a covered project's folder name as a whole word.
The proposal is drafted in one more model call with no tools, after the retro's own call (ADR 0004), and the provider receives only the causes that passed the retro's check and the events they cite, the same kind of data ADR 0004 accepted.
How widely a cause or proposal claims a pattern holds rests on the prompts, a recorded retro case and the owner's run on the real log, not on a word test in code.

## Alternatives

- **The GitHub REST API with a token from the environment:** Flight Recorder would then hold a token that can write to the owner's repositories, and the CLI would need its own HTTP client and error handling for GitHub.
- **A flag, such as `--open`, given before the proposal is drafted:** the owner would confirm text they have not read.
- **Opening a pull request against the factory:** heavier, and `docs/ARCHITECTURE.md` already says issues first, pull requests once issues prove useful.
- **No filter, the owner's reading as the only check:** `AGENT-APPS.md` section 8 asks for a filter in code on anything published.
- **Dropping the name filter while the repository is private:** the owner treats it as public, since it may go public later and its issues would go with it.
- **Withholding text that says `every`, `all` or `most` beyond the changes it cites:** it catches none of issue #12's four real examples, which misread the events rather than miscount the changes (the "hours" cause cited all 5 changes), and it would drop good text such as "all the small changes".

## Consequences

- Flight Recorder's one write anywhere is an issue the owner confirmed; it still never writes to the event log or to the factory's code, and the owner still decides every factory change.
- `flight propose` needs `gh` installed and logged in on the Mac; without it the proposal is still printed and can be copied by hand.
- A `flight propose` costs two model calls, the retro's and the proposal's.
- The name filter can withhold a proposal that names a public project, such as Flight Recorder itself; the owner runs it again.
- A cause or proposal that overstates how widely a pattern holds can still be printed; the owner reads every proposal before confirming it.
- Where the proposal is shown on the site later, it opens nothing: approving one there changes only the visitor's session.

## What enforces it

The acceptance tests of `docs/specs/flight-propose.md`: AC22 checks that nothing runs without `y` or `yes`, AC23 the exact `gh` command and body, AC19 and AC20 that a withheld proposal is never offered, and AC26 that `flight retro` never asks or runs anything.
