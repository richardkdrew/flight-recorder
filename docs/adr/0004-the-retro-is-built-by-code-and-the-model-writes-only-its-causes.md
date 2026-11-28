# 0004: A retro's change sections are built by code, and the model writes only its causes, in one call with no tools

Status: proposed
Date: 2026-11-24
Supersedes: the part of 0003 that says the provider receives only the prompt, the question and the tool results of that question

## Context

`flight retro` reports on a set of changes the code chooses from the log: the last 5 accepted, or those accepted since a date.
The owner wants, for each change, where the run stopped, how they answered and the friction notes, and then the causes that repeat across changes, with counts and event ids, and what went well.
The per-change facts follow from fixed queries; tying free-text friction notes to the stops they explain needs judgement.
`docs/ARCHITECTURE.md` describes the agent as choosing which queries to run, and ADR 0003 says the provider receives only the prompt, the question and the tool results of that question.

## Decision

The core builds each change's section from fixed queries, with no model.
With 2 or more changes covered, it sends one request to `claude-sonnet-5-5`, offering no tools: the retro prompt and, as data inside delimiters, the covered changes' events and the friction notes in the range, with each project as the last segment of its folder path and friction notes as they are.
The model returns the causes and what went well as JSON with cited ids; the core checks every cited id against the data it sent, counts each cause's changes and events itself, and drops causes that do not span 2 changes.

## Alternatives

- **The `ask` agent loop with its four tools:** the model would spend several calls fetching events the code has already chosen, and the cost and time of a retro would vary with its choices.
- **Code alone, counting stop kinds:** free, but it cannot relate a friction note to the stops it explains, which is the point of the retro.
- **The model writes the whole retro:** the per-change facts would then depend on the model, and could be wrong where code is exact.

## Consequences

- A retro costs one model call, bounded by the existing 120-second timeout, an output cap of its own of 8,192 tokens (`RETRO_OUTPUT_TOKENS`; a question's calls keep 4,096), and by covering at most 20 changes.
  The cap is twice a question's because one reply carries every cause and what went well with all their ids, and a real log's 5 changes were cut off at 4,096; the prompt also asks for a short reply (at most 5 causes and 3 went-well items, two sentences and 10 ids each), and a reply stopped at the cap is rejected as not in the expected form.
- The change sections are printed even when the model fails or its citations do not check out.
- The provider receives the covered changes' events and the friction notes in the range, the same kind of data ADR 0003 accepted under Anthropic's commercial API terms.
- The site's later "retro step by step" can show the code's sections first and the model's causes after, from the same core functions.

## What enforces it

The acceptance tests of `docs/specs/flight-retro.md`: AC12 checks one request with no tools, AC8 that no request holds a full folder path, and AC13 that a failed citation withholds the causes.
