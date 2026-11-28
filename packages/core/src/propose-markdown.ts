// A proposal as Markdown, printed after the retro, and as the issue it may become: the issue's body is the
// printed section without its heading, so what the owner reads is what is posted. The model's text goes
// through markdownText(), as a retro's causes do; the issue's title is plain text on one line.

import type { Proposal } from "./propose.ts";
import { code, day, markdownText, oneLine, plural } from "./retro-markdown.ts";

/** What is printed when the retro printed `## Causes that repeat` with no cause in it. */
export const NO_CAUSE_TO_PROPOSE =
  "not enough data yet: a proposal needs at least one cause that repeats";

/** The line printed when the proposal's reply says the causes cannot support one. */
export function renderProposalNeeds(needs: string): string {
  return `not enough data yet: ${markdownText(needs)}\n`;
}

export interface RenderedProposal {
  /** The `## Proposal: <title>` section, for stdout. */
  readonly markdown: string;
  /** The issue's title: the title on one line, control characters removed, not escaped. */
  readonly title: string;
  /** The issue's body: the section without its heading line and the blank lines around it. */
  readonly body: string;
}

export function renderProposal(proposal: Proposal): RenderedProposal {
  const d = proposal.drafted;
  const counts = `${plural(proposal.changes, "change", "changes")}, ${plural(proposal.events, "event", "events")}`;
  const body = [
    `The problem: ${markdownText(proposal.problem)}`,
    "",
    `The change: ${markdownText(proposal.change)}`,
    "",
    `Rests on (${counts}): ${proposal.cites.map(code).join(", ")}`,
    "",
    `Drafted by Flight Recorder (${code(d.model)}, prompt ${code(d.promptHash.slice(0, 12))}) from a retro of ${plural(d.changes, "change", "changes")} accepted ${day(d.firstAccepted)} to ${day(d.lastAccepted)}; the ids are events in the factory's log.`,
  ].join("\n");
  return {
    markdown: `## Proposal: ${markdownText(proposal.title)}\n\n${body}\n`,
    title: oneLine(proposal.title),
    body,
  };
}
