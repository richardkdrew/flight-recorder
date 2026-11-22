# 0001: The code is a TypeScript npm workspace with a runtime-free core and a Node CLI

Status: proposed
Date: 2026-11-23

## Context

Flight Recorder runs first as a CLI on the owner's Mac and later as a Cloudflare Worker behind the public site.
Both must run the same agent: its tools, its prompt, the citation check and the limits.
`docs/ARCHITECTURE.md` already settles TypeScript, so the CLI and the Worker can share that code.
The owner's `TYPESCRIPT.md` says to split out a core when a second runtime needs the same logic, and to keep that core free of any runtime's types or imports.

## Decision

The repository is one npm workspace.
`packages/core` holds the agent and reaches the log only through a small read-only `LogReader` interface; its tsconfig sets `types: []`, so a Node import or global fails the type check.
`apps/cli` is the `flight` command: it wires Node, the SQLite connection and the Anthropic client into the core.
Packages are used as source, with no build step; Node 26 runs the CLI's `.ts` files directly.

## Alternatives

- **One package now, split later:** the core's freedom from Node would then be a promise nobody checks until the Worker change, when it is most expensive to fix.
- **A build step that emits JavaScript:** nothing installs these packages from outside the repository, so it would add a step with nothing to gain.

## Consequences

- The Worker can import `@flight/core` unchanged.
- The core cannot read its prompt file itself; the entry point reads it and passes it in.
- Node's type stripping needs `.ts` extensions in the CLI's relative imports.

## What enforces it

`tsc --noEmit -p packages/core` in `make check`, with `types: []` in the core's tsconfig.
