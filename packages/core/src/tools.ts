// The agent's four tools. Each only reads, takes Zod-parsed input, runs fixed parameterised queries,
// and returns at most BYTE_CAP bytes of JSON, and at most ROW_CAP events or deliveries. Every event id and delivery id a tool
// returns is added to `returned`, which the citation check reads.

import * as z from "zod";

import { BYTE_CAP, ROW_CAP } from "./limits.ts";
import { projectMatches, projectName, type LogReader } from "./log.ts";
import { tool, type RunnableTool } from "./model.ts";

/** An event as the tools return it: `data` parsed, `project` reduced to its last path segment. */
export interface ToolEvent {
  readonly id: string;
  readonly time: string;
  readonly type: string;
  readonly project: string | null;
  readonly change: string | null;
  readonly delivery: string | null;
  readonly source: string;
  readonly data: unknown;
}

const EventRow = z.object({
  id: z.string(),
  time: z.string(),
  type: z.string(),
  project: z.string().nullable(),
  change: z.string().nullable(),
  delivery: z.string().nullable(),
  source: z.string(),
  data: z.string(),
});

const EVENT_COLUMNS = "id, time, type, project, change, delivery, source, data";

/** The fields of an event, as describe_log explains them. */
const FIELDS = [
  { name: "id", meaning: "the event's id, 32 hex characters; cite it" },
  { name: "time", meaning: "when it happened, ISO 8601 in UTC" },
  { name: "type", meaning: "what happened, such as orc.agent.finished.v1" },
  {
    name: "project",
    meaning: "the project's folder name; eval:<suite> for an eval",
  },
  { name: "change", meaning: "the change's name" },
  {
    name: "delivery",
    meaning:
      "one id per change, from its spec to its merge, 32 hex characters; cite it",
  },
  {
    name: "source",
    meaning: "the factory version that recorded it, orc@<commit>",
  },
  { name: "data", meaning: "the event's own fields, which depend on its type" },
] as const;

const encoder = new TextEncoder();
const bytes = (text: string): number => encoder.encode(text).length;

interface Fitted<T> {
  readonly rows: readonly T[];
  readonly truncated: boolean;
  readonly text: string;
}

/**
 * Keeps the first rows that fit both caps, dropping from the end; `more` says the query had rows past these.
 * `envelope` builds the whole result from the rows kept and the final `truncated`, and the cap is checked
 * against that exact JSON. The result can only exceed BYTE_CAP if the envelope with no rows does on its own.
 */
export function fitRows<T>(
  rows: readonly T[],
  more: boolean,
  envelope: (rows: readonly T[], truncated: boolean) => unknown,
  rowCap: number = ROW_CAP,
): Fitted<T> {
  const candidates = rows.slice(0, rowCap);
  const cut = more || rows.length > candidates.length;
  const render = (kept: number): Fitted<T> => {
    const fitted = candidates.slice(0, kept);
    const truncated = cut || kept < candidates.length;
    return {
      rows: fitted,
      truncated,
      text: JSON.stringify(envelope(fitted, truncated)),
    };
  };
  const fits = (result: Fitted<T>): boolean => bytes(result.text) <= BYTE_CAP;
  const all = render(candidates.length);
  if (fits(all)) return all;
  // The size never shrinks as rows are added: a row adds at least 2 bytes, and `false` is only 1 byte
  // longer than `true`, so the largest number of rows that fits is found by halving.
  let lo = 0;
  let hi = candidates.length;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(render(mid))) lo = mid;
    else hi = mid;
  }
  return render(lo);
}

function parseData(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function toEvent(row: unknown): ToolEvent {
  const e = EventRow.parse(row);
  return { ...e, project: projectName(e.project), data: parseData(e.data) };
}

const Name = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[^/]+$/, "a project's folder name, with no /");
const Source = z
  .string()
  .min(1)
  .max(200)
  .describe("A factory version, orc@<commit>.");
const Id = z.string().min(1).max(64);
const Limit = z
  .number()
  .int()
  .min(1)
  .max(ROW_CAP)
  .optional()
  .describe(`At most this many rows, up to ${String(ROW_CAP)}, the default.`);
const Time = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);

const DescribeInput = z.strictObject({});
const ListDeliveriesInput = z.strictObject({
  source: Source.optional().describe(
    "Only deliveries with an event from this factory version.",
  ),
  project: Name.optional().describe("Only this project, by its folder name."),
  limit: Limit,
});
const ReadDeliveryInput = z.strictObject({
  delivery: Id.describe("The delivery id."),
});
const FindEventsInput = z.strictObject({
  type: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe("Only events of this type."),
  source: Source.optional().describe("Only events from this factory version."),
  project: Name.optional().describe("Only this project, by its folder name."),
  delivery: Id.optional().describe("Only events of this delivery."),
  since: Time.optional().describe("Only events at or after this date or time."),
  until: Time.optional().describe("Only events before this date or time."),
  limit: Limit,
});

const Count = z.number().int();
const OverviewRow = z.object({
  events: Count,
  deliveries: Count,
  first: z.string().nullable(),
  last: z.string().nullable(),
});
const TypeRow = z.object({ type: z.string(), events: Count });
const FieldRow = z.object({
  type: z.string(),
  field: z.union([z.string(), z.number()]),
});
const VersionRow = z.object({
  source: z.string(),
  events: Count,
  first: z.string(),
  last: z.string(),
});
const DeliveryRow = z.object({
  id: z.string(),
  project: z.string().nullable(),
  change: z.string().nullable(),
  first: z.string(),
  last: z.string(),
  sources: z.string(),
});
const CountRow = z.object({
  delivery: z.string(),
  type: z.string(),
  events: Count,
});

async function describeLog(log: LogReader): Promise<string> {
  const [overview, types, fields, versions] = await Promise.all([
    log.all(
      "SELECT COUNT(*) AS events, COUNT(DISTINCT delivery) AS deliveries, MIN(time) AS first, MAX(time) AS last FROM events",
      [],
    ),
    log.all(
      "SELECT type, COUNT(*) AS events FROM events GROUP BY type ORDER BY type",
      [],
    ),
    log.all(
      "SELECT DISTINCT e.type AS type, j.key AS field FROM events AS e, json_each(e.data) AS j WHERE json_valid(e.data) ORDER BY type, field",
      [],
    ),
    log.all(
      "SELECT source, COUNT(*) AS events, MIN(time) AS first, MAX(time) AS last FROM events GROUP BY source ORDER BY first DESC, source",
      [],
    ),
  ]);
  const totals = OverviewRow.parse(overview[0]);
  const fieldsByType = new Map<string, string[]>();
  for (const row of fields) {
    const { type, field } = FieldRow.parse(row);
    fieldsByType.set(type, [...(fieldsByType.get(type) ?? []), String(field)]);
  }
  const typeList = types.map((row) => {
    const { type, events } = TypeRow.parse(row);
    return { type, events, data_fields: fieldsByType.get(type) ?? [] };
  });
  const versionList = versions.map((row) => {
    const v = VersionRow.parse(row);
    return {
      source: v.source,
      events: v.events,
      first_time: v.first,
      last_time: v.last,
    };
  });
  // The types and the versions are one list of rows for the caps, in the order the result holds them, so
  // the byte cap covers the whole result and rows are dropped from the end: the oldest versions first,
  // then the types. Neither is a list of events or deliveries, so only the byte cap applies.
  type Row =
    | { readonly type: (typeof typeList)[number] }
    | { readonly version: (typeof versionList)[number] };
  const rows: Row[] = [
    ...typeList.map((type) => ({ type })),
    ...versionList.map((version) => ({ version })),
  ];
  const fitted = fitRows(
    rows,
    false,
    (kept, truncated) => ({
      fields: FIELDS,
      events: totals.events,
      deliveries: totals.deliveries,
      first_time: totals.first,
      last_time: totals.last,
      types: kept.flatMap((row) => ("type" in row ? [row.type] : [])),
      versions: kept.flatMap((row) => ("version" in row ? [row.version] : [])),
      truncated,
    }),
    Infinity,
  );
  return fitted.text;
}

async function listDeliveries(
  log: LogReader,
  input: z.infer<typeof ListDeliveriesInput>,
  returned: Set<string>,
): Promise<string> {
  const limit = input.limit ?? ROW_CAP;
  const rows = await log.all(
    `SELECT delivery AS id, MAX(project) AS project, MAX(change) AS change, MIN(time) AS first, MAX(time) AS last,
            json_group_array(DISTINCT source) AS sources
       FROM events
      WHERE delivery IS NOT NULL AND ${projectMatches(2)}
      GROUP BY delivery
     HAVING ?1 IS NULL OR SUM(source = ?1) > 0
      ORDER BY first, id
      LIMIT ?3`,
    [input.source ?? null, input.project ?? null, limit + 1],
  );
  const deliveries = rows.slice(0, limit).map((row) => DeliveryRow.parse(row));
  const counts = await log.all(
    `SELECT delivery, type, COUNT(*) AS events FROM events
      WHERE delivery IN (SELECT value FROM json_each(?1))
      GROUP BY delivery, type ORDER BY delivery, type`,
    [JSON.stringify(deliveries.map((d) => d.id))],
  );
  const byDelivery = new Map<string, Record<string, number>>();
  for (const row of counts) {
    const c = CountRow.parse(row);
    byDelivery.set(c.delivery, {
      ...byDelivery.get(c.delivery),
      [c.type]: c.events,
    });
  }
  const shaped = deliveries.map((d) => ({
    id: d.id,
    project: projectName(d.project),
    change: d.change,
    first_time: d.first,
    last_time: d.last,
    versions: z.array(z.string()).parse(JSON.parse(d.sources)).sort(),
    events: byDelivery.get(d.id) ?? {},
  }));
  const fitted = fitRows(
    shaped,
    rows.length > limit,
    (deliveries, truncated) => ({
      deliveries,
      truncated,
    }),
  );
  for (const d of fitted.rows) returned.add(d.id);
  return fitted.text;
}

function events(
  rows: readonly Record<string, unknown>[],
  limit: number,
  returned: Set<string>,
  envelope: (events: readonly ToolEvent[], truncated: boolean) => unknown,
): string {
  const fitted = fitRows(
    rows.slice(0, limit).map(toEvent),
    rows.length > limit,
    envelope,
  );
  for (const e of fitted.rows) {
    returned.add(e.id);
    if (e.delivery !== null) returned.add(e.delivery);
  }
  return fitted.text;
}

async function readDelivery(
  log: LogReader,
  input: z.infer<typeof ReadDeliveryInput>,
  returned: Set<string>,
): Promise<string> {
  const rows = await log.all(
    `SELECT ${EVENT_COLUMNS} FROM events WHERE delivery = ?1 ORDER BY time, seq LIMIT ?2`,
    [input.delivery, ROW_CAP + 1],
  );
  return events(rows, ROW_CAP, returned, (events, truncated) => ({
    delivery: input.delivery,
    events,
    truncated,
  }));
}

async function findEvents(
  log: LogReader,
  input: z.infer<typeof FindEventsInput>,
  returned: Set<string>,
): Promise<string> {
  const limit = input.limit ?? ROW_CAP;
  const rows = await log.all(
    `SELECT ${EVENT_COLUMNS} FROM events
      WHERE (?1 IS NULL OR type = ?1)
        AND (?2 IS NULL OR source = ?2)
        AND ${projectMatches(3)}
        AND (?4 IS NULL OR delivery = ?4)
        AND (?5 IS NULL OR julianday(time) >= julianday(?5))
        AND (?6 IS NULL OR julianday(time) < julianday(?6))
      ORDER BY time, seq
      LIMIT ?7`,
    [
      input.type ?? null,
      input.source ?? null,
      input.project ?? null,
      input.delivery ?? null,
      input.since ?? null,
      input.until ?? null,
      limit + 1,
    ],
  );
  return events(rows, limit, returned, (events, truncated) => ({
    events,
    truncated,
  }));
}

const CAPS = `At most ${String(ROW_CAP)} rows and ${String(BYTE_CAP)} bytes; "truncated": true means there were more, so narrow the query.`;

/** The tools for one question, reading `log` and adding every id they return to `returned`. */
export function makeTools(
  log: LogReader,
  returned: Set<string>,
): RunnableTool[] {
  return [
    tool({
      name: "describe_log",
      description: `Describes the event log: its fields, its event types with their counts and data fields, the number of events and deliveries, the first and last time, and the factory versions present (newest first). At most ${String(BYTE_CAP)} bytes; "truncated": true means some types or versions were left out.`,
      schema: DescribeInput,
      run: () => describeLog(log),
    }),
    tool({
      name: "list_deliveries",
      description: `Lists deliveries, oldest first: each one's id, project, change, first and last time, factory versions, and event counts by type. ${CAPS}`,
      schema: ListDeliveriesInput,
      run: (input) => listDeliveries(log, input, returned),
    }),
    tool({
      name: "read_delivery",
      description: `Returns one delivery's events, oldest first. ${CAPS}`,
      schema: ReadDeliveryInput,
      run: (input) => readDelivery(log, input, returned),
    }),
    tool({
      name: "find_events",
      description: `Finds events matching every filter given, oldest first. It gives no total count, only whether there are more. ${CAPS}`,
      schema: FindEventsInput,
      run: (input) => findEvents(log, input, returned),
    }),
  ];
}
