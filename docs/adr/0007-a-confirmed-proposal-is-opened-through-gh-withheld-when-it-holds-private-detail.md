# 0007: A confirmed proposal is opened as an issue through `gh`, and withheld in code when it holds private detail

Status: proposed
Date: 2026-11-28
Supersedes: 0005, 0006

## Context

`flight propose` drafts one improvement proposal for the factory from a retro's causes, and the owner wants it opened as an issue on the factory repository, `richardkdrew/agentic-orc-factory`, only when they confirm.
Until now Flight Recorder wrote nothing anywhere: `docs/ARCHITECTURE.md` says it never writes to the event log or the factory.
An issue is a write to GitHub.
The repository is private today, but the owner treats it as public because it may go public later, so an issue may publish text a model wrote from the owner's private log, which names private projects and holds the owner's own friction notes, where paths and addresses can appear.
`AGENT-APPS.md` asks for an ADR for anything that changes something, and for a filter on anything the app publishes.

ADR 0005 withheld a proposal only when it named a covered change or a covered project.
The owner asked for a wider filter: any project in the log, not only the covered ones, filesystem paths and email addresses.
This ADR is ADR 0005 with that filter, and without the `every`, `all` and `most` test that ADR 0006 also dropped.

## Decision

The CLI opens an issue only after it has printed the proposal in full and the owner has answered `y` or `yes` at a terminal to the question that names the repository.
It runs `gh issue create --repo richardkdrew/agentic-orc-factory --title <title> --body-file -`, with no shell, the body on standard input and a 60-second timeout, so it uses the owner's own `gh` login and Flight Recorder holds no GitHub token.
The issue's title and body are exactly what was printed.
The model has no tool that writes: the issue is opened by the CLI's code, never by the model.

The core withholds a proposal, so it is never printed or offered for opening, when it cites nothing, cites an id no printed cause cites, or its title, problem or change holds:

- a covered change's name, as a whole word in any case;
- the last path segment of any project in the log, as a whole word in any case;
- a filesystem path: `/`, `~/` or `./` starting a word and followed by a path segment, or `/Users/`, `/private/` or `/home/` anywhere;
- an email address.

The proposal is drafted in one more model call with no tools, after the retro's own call (ADR 0004), and the provider receives only the causes that passed the retro's check and the events they cite, the same kind of data ADR 0004 accepted; the project names the filter uses are never sent.
How widely a cause or proposal claims a pattern holds rests on the prompts, a recorded retro case and the owner's run on the real log, not on a word test in code.
The owner's reading of the proposal before confirming remains the last check.

## Alternatives

- **The GitHub REST API with a token from the environment:** Flight Recorder would then hold a token that can write to the owner's repositories, and the CLI would need its own HTTP client and error handling for GitHub.
- **A flag, such as `--open`, given before the proposal is drafted:** the owner would confirm text they have not read.
- **Opening a pull request against the factory:** heavier, and `docs/ARCHITECTURE.md` already says issues first, pull requests once issues prove useful.
- **No filter, the owner's reading as the only check:** `AGENT-APPS.md` section 8 asks for a filter in code on anything published.
- **Dropping the filter while the repository is private:** the owner treats it as public, since it may go public later and its issues would go with it.
- **Only the covered changes and projects (ADR 0005):** a proposal can name a project outside the retro's window, or quote a path or an address from a friction note.
- **The factory's own path filter, used for the curated export:** it lives in the factory, not in Flight Recorder, and calling it would add a dependency on the factory's code for one check.
- **A word test on `every`, `all` and `most`:** it catches none of issue #12's four real overstatements and drops good text such as "all the small changes".

## Consequences

- Flight Recorder's one write anywhere is an issue the owner confirmed; it still never writes to the event log or to the factory's code, and the owner still decides every factory change.
- `flight propose` needs `gh` installed and logged in on the Mac; without it the proposal is still printed and can be copied by hand.
- A `flight propose` costs two model calls, the retro's and the proposal's, and one more fixed query for the projects in the log.
- The filter can withhold a good proposal: one that names a public project, such as Flight Recorder itself, or writes a command such as ` /retro` after a space; the owner runs it again.
- Private detail without a shape, such as a person's name in a friction note, is not caught in code; the owner reads every proposal before confirming it.
- A cause or proposal that overstates how widely a pattern holds can still be printed.
- Where the proposal is shown on the site later, it opens nothing: approving one there changes only the visitor's session.

## What enforces it

The acceptance tests of `docs/specs/flight-propose.md`: AC22 checks that nothing runs without `y` or `yes`, AC23 the exact `gh` command and body, AC19 and AC20 that a withheld proposal is never printed or offered, with a case for each kind of private detail, and AC26 that `flight retro` never asks or runs anything.
