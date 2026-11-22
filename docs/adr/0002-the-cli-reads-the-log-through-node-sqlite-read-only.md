# 0002: The CLI reads the event log through node:sqlite on a read-only connection

Status: proposed
Date: 2026-11-23
Revisit when: node:sqlite misbehaves on the pinned Node version, or cannot open the factory's WAL log read-only.

## Context

Flight Recorder must never write to the factory's event log, which orc keeps in WAL mode and may be writing while Flight Recorder reads.
The owner's `AGENT-APPS.md` asks for a read-only connection behind read-only tools, so a mistake cannot become a write.
The owner's `TYPESCRIPT.md` prefers Node's built-ins, names `node:sqlite` where its stability is acceptable, and keeps install scripts off.

## Decision

The CLI opens the log with `node:sqlite` `DatabaseSync` and `readOnly: true`, sets `PRAGMA query_only = ON`, and refuses a path where no file exists rather than creating one.
Only `flight seed` opens a database for writing, and only a file that does not exist yet.

## Alternatives

- **better-sqlite3:** a native binary, which needs its install script turned back on, for no feature this needs.
- **Copying the log before reading it:** a copy taken mid-write can be inconsistent, and a read-only connection already guarantees no write.

## Consequences

- No native dependency, and nothing to rebuild in `make setup`.
- The CLI depends on the stability of `node:sqlite` in the pinned Node version.

## What enforces it

The acceptance test that the log's bytes are unchanged after a question and that a missing path is not created (AC2 of `docs/specs/flight-ask.md`).
