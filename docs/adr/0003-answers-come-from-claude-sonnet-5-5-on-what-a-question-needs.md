# 0003: The CLI's answers come from claude-sonnet-5-5, which receives only the tool results a question needs

Status: proposed
Date: 2026-11-23

## Context

The owner chose `claude-sonnet-5-5` through the Anthropic SDK for the CLI.
The owner's `AGENT-APPS.md` asks each project to record its provider, what is sent to it, and the provider's terms for keeping data and training on it.
The live log names folders on the owner's Mac and holds free-text friction notes, and every tool result in an answer is sent to the provider.

## Decision

The model is `claude-sonnet-5-5`, named once in the core.
The provider receives the prompt, the question and the tool results of that question, and nothing else from the Mac.
Tool results give each project as its folder name, the last segment of its path, never the full path; friction notes are sent as they are.
The owner confirms that Anthropic's current commercial API terms for keeping and training on API data are acceptable for this data.

## Alternatives

- **Send the full project path:** it names the owner's folders and adds nothing an answer needs.
- **Leave friction notes out:** questions about friction could then not be answered, and they are the reason the retro exists.
- **A local model:** the owner chose Claude, and local models would need their own evals.

## Consequences

- A question about the live log sends some of the owner's own notes to Anthropic, under its API terms.
- The rule "the live log never leaves the Mac" in `docs/ARCHITECTURE.md` becomes "the live log is never published, and only what a question needs goes to the model provider".

## What enforces it

The tool tests, which check that no tool result holds a project's full path; and the owner, at review.
