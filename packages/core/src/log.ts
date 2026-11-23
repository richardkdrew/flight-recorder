// How the core reads the event log: through one read-only query function, so it never knows whether
// the log is a local SQLite file or D1. The SQL is always one of the core's own fixed queries.

export type SqlValue = string | number | null;

export interface LogReader {
  /** Runs one of the core's fixed, parameterised queries (`?1`, `?2`, ...) and returns its rows. */
  all(
    sql: string,
    params: readonly SqlValue[],
  ): Promise<readonly Record<string, unknown>[]>;
}

/**
 * The last segment of a project's folder path, which is all the model ever sees of it (ADR 0003).
 * A project with no `/`, such as `eval:<name>`, is returned as it is; a missing project stays null.
 */
export function projectName(project: string | null): string | null {
  if (project === null) return null;
  const trimmed = project.replace(/\/+$/, "");
  return trimmed.slice(trimmed.lastIndexOf("/") + 1);
}

/**
 * The SQL condition that `project` matches the name in parameter `?n` by its last path segment,
 * or that the parameter is null. It agrees with `projectName`.
 */
export function projectMatches(n: number): string {
  const p = `?${String(n)}`;
  return `(${p} IS NULL OR rtrim(project, '/') = ${p} OR substr(rtrim(project, '/'), -length(${p}) - 1) = '/' || ${p})`;
}
