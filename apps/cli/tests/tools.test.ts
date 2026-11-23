// The four tools, as the model sees them: what each returns, their filters, their caps, and that a project
// reaches the model only as its folder name.

import { describe, expect, test } from "vitest";
import * as z from "zod";

import { BYTE_CAP, ROW_CAP } from "@flight/core";

import { event, flight, hex32, makeLog, syntheticLog } from "./harness.ts";
import { finalReply, toolResults, toolUse } from "./replay.ts";
import { loadDataSet } from "../src/seed.ts";

const V1 = "orc@" + "1".repeat(40);
const V2 = "orc@" + "2".repeat(40);

/** Runs one tool call against `log` and returns the tool's result as the model received it. */
async function call(
  log: string,
  name: string,
  input: Record<string, unknown>,
): Promise<{ text: string; isError: boolean }> {
  const run = await flight(
    ["ask", "a test question", "--log", log],
    [
      toolUse(name, input),
      finalReply({ kind: "not_enough_data", needs: "nothing; this is a test" }),
    ],
  );
  const second = run.sent[1];
  if (!second) throw new Error(`the tool result was never sent\n${run.stderr}`);
  const [result] = toolResults(second);
  if (!result) throw new Error("the second request holds no tool result");
  return result;
}

async function json(
  log: string,
  name: string,
  input: Record<string, unknown> = {},
): Promise<unknown> {
  const result = await call(log, name, input);
  expect(result.isError, result.text).toBe(false);
  return JSON.parse(result.text);
}

const Events = z.object({
  events: z.array(
    z.object({
      id: z.string(),
      time: z.string(),
      type: z.string(),
      project: z.string().nullable(),
      change: z.string().nullable(),
      delivery: z.string().nullable(),
      source: z.string(),
      data: z.unknown(),
    }),
  ),
  truncated: z.boolean(),
});

const Deliveries = z.object({
  deliveries: z.array(
    z.object({
      id: z.string(),
      project: z.string().nullable(),
      change: z.string().nullable(),
      first_time: z.string(),
      last_time: z.string(),
      versions: z.array(z.string()),
      events: z.record(z.string(), z.number()),
    }),
  ),
  truncated: z.boolean(),
});

const synthetic = loadDataSet();
const deliveryIds = [
  ...new Set(synthetic.flatMap((e) => (e.delivery ? [e.delivery] : []))),
];

describe("describe_log", () => {
  test("describes the synthetic log: its counts, times, types with their data fields, and versions newest first", async () => {
    const result = z
      .object({
        fields: z.array(z.object({ name: z.string(), meaning: z.string() })),
        events: z.number(),
        deliveries: z.number(),
        first_time: z.string(),
        last_time: z.string(),
        types: z.array(
          z.object({
            type: z.string(),
            events: z.number(),
            data_fields: z.array(z.string()),
          }),
        ),
        versions: z.array(
          z.object({
            source: z.string(),
            events: z.number(),
            first_time: z.string(),
            last_time: z.string(),
          }),
        ),
        truncated: z.literal(false),
      })
      .parse(await json(syntheticLog(), "describe_log"));
    expect(result.events).toBe(synthetic.length);
    expect(result.deliveries).toBe(deliveryIds.length);
    expect(result.first_time).toBe(synthetic[0]?.time);
    expect(result.last_time).toBe(synthetic.at(-1)?.time);
    expect(result.fields.map((f) => f.name)).toEqual([
      "id",
      "time",
      "type",
      "project",
      "change",
      "delivery",
      "source",
      "data",
    ]);
    expect(result.types).toHaveLength(11);
    expect(
      result.types.find((t) => t.type === "orc.owner.judged.v1")?.data_fields,
    ).toEqual(["commit", "verdict"]);
    expect(result.versions).toHaveLength(2);
    const [newest, oldest] = result.versions;
    expect(newest && oldest && newest.first_time > oldest.first_time).toBe(
      true,
    );
  });
});

describe("list_deliveries", () => {
  test("lists every delivery oldest first, with its versions and event counts by type", async () => {
    const result = Deliveries.parse(
      await json(syntheticLog(), "list_deliveries"),
    );
    expect(result.truncated).toBe(false);
    expect(result.deliveries.map((d) => d.id)).toEqual(deliveryIds);
    const first = result.deliveries[0];
    const own = synthetic.filter((e) => e.delivery === first?.id);
    expect(first?.change).toBe(own[0]?.change);
    expect(first?.first_time).toBe(own[0]?.time);
    expect(first?.last_time).toBe(own.at(-1)?.time);
    expect(Object.values(first?.events ?? {}).reduce((a, b) => a + b, 0)).toBe(
      own.length,
    );
  });

  test("filters by project folder name and by factory version, and says when a limit cut the list", async () => {
    const log = syntheticLog();
    const tide = Deliveries.parse(
      await json(log, "list_deliveries", { project: "tide-tables" }),
    );
    expect(tide.deliveries.map((d) => d.project)).toEqual([
      "tide-tables",
      "tide-tables",
      "tide-tables",
    ]);
    const older = synthetic[0]?.source ?? "";
    const v1 = Deliveries.parse(
      await json(log, "list_deliveries", { source: older }),
    );
    expect(v1.deliveries).toHaveLength(3);
    for (const d of v1.deliveries) expect(d.versions).toEqual([older]);
    const two = Deliveries.parse(
      await json(log, "list_deliveries", { limit: 2 }),
    );
    expect(two.deliveries).toHaveLength(2);
    expect(two.truncated).toBe(true);
  });
});

describe("read_delivery", () => {
  test("returns one delivery's events oldest first, with data parsed", async () => {
    const id = deliveryIds[1] ?? "";
    const result = Events.parse(
      await json(syntheticLog(), "read_delivery", { delivery: id }),
    );
    const own = synthetic.filter((e) => e.delivery === id);
    expect(result.events.map((e) => e.id)).toEqual(own.map((e) => e.id));
    expect(result.events[0]?.data).toEqual(own[0]?.data);
    expect(result.truncated).toBe(false);
  });

  test("returns no events for a delivery the log does not hold", async () => {
    const result = Events.parse(
      await json(syntheticLog(), "read_delivery", { delivery: "f".repeat(32) }),
    );
    expect(result.events).toEqual([]);
  });
});

describe("find_events", () => {
  const log = makeLog([
    event("a1", {
      time: "2026-10-01T09:00:00+00:00",
      type: "orc.checks.recorded.v1",
      delivery: hex32("d1"),
      source: V1,
      data: { passed: 1 },
    }),
    event("a2", {
      time: "2026-10-15T09:00:00Z",
      type: "orc.friction.noted.v1",
      source: V1,
    }),
    event("a3", {
      time: "2026-11-01T09:00:00+00:00",
      type: "orc.checks.recorded.v1",
      project: "/Users/someone/Clients/beta-site",
      delivery: hex32("d2"),
      source: V2,
      data: { passed: 2 },
    }),
    event("a4", {
      time: "2026-11-02T09:00:00+00:00",
      type: "orc.eval.finished.v1",
      project: "eval:spec-review",
      source: V2,
    }),
    event("a5", {
      time: "2026-11-03T09:00:00+00:00",
      type: "orc.friction.noted.v1",
      project: null,
      source: V2,
    }),
  ]);
  const ids = async (input: Record<string, unknown>): Promise<string[]> =>
    Events.parse(await json(log, "find_events", input)).events.map((e) =>
      e.id.slice(0, 2),
    );

  test("filters by type, version, project, delivery and time, oldest first", async () => {
    expect(await ids({})).toEqual(["a1", "a2", "a3", "a4", "a5"]);
    expect(await ids({ type: "orc.checks.recorded.v1" })).toEqual(["a1", "a3"]);
    expect(await ids({ source: V2 })).toEqual(["a3", "a4", "a5"]);
    expect(await ids({ project: "alpha-shop" })).toEqual(["a1", "a2"]);
    expect(await ids({ project: "eval:spec-review" })).toEqual(["a4"]);
    expect(await ids({ delivery: hex32("d2") })).toEqual(["a3"]);
    expect(await ids({ since: "2026-10-15", until: "2026-11-02" })).toEqual([
      "a2",
      "a3",
    ]);
    expect(await ids({ since: "2026-10-15T09:00:00+00:00" })).toEqual([
      "a2",
      "a3",
      "a4",
      "a5",
    ]);
    expect(await ids({ limit: 2 })).toEqual(["a1", "a2"]);
  });

  test("gives each project as its folder name, keeps a project with no / as it is, and null as null", async () => {
    const result = Events.parse(await json(log, "find_events"));
    expect(result.events.map((e) => e.project)).toEqual([
      "alpha-shop",
      "alpha-shop",
      "beta-site",
      "eval:spec-review",
      null,
    ]);
  });

  test("refuses a project filter that is a path, as a tool error the question survives", async () => {
    const result = await call(log, "find_events", {
      project: "/Users/someone/Work/alpha-shop",
    });
    expect(result.isError).toBe(true);
    expect(result.text).not.toContain("/Users/someone");
  });
});

describe("the caps on a tool result", () => {
  test(`a result holds at most ${String(ROW_CAP)} events, and says it was truncated`, async () => {
    const log = makeLog(
      Array.from({ length: 150 }, (_, i) =>
        event(`b${String(i).padStart(3, "0")}`, {
          time: `2026-11-01T09:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}+00:00`,
          data: { note: "n" },
        }),
      ),
    );
    const result = Events.parse(await json(log, "find_events"));
    expect(result.events).toHaveLength(ROW_CAP);
    expect(result.truncated).toBe(true);
    expect(result.events[0]?.id).toBe(hex32("b000"));
  });

  test(`a result holds at most ${String(BYTE_CAP)} bytes of JSON, dropping events from the end`, async () => {
    const note = "é".repeat(1000);
    const log = makeLog(
      Array.from({ length: 40 }, (_, i) =>
        event(`c${String(i).padStart(2, "0")}`, { data: { note } }),
      ),
    );
    const raw = await call(log, "find_events", {});
    expect(new TextEncoder().encode(raw.text).length).toBeLessThanOrEqual(
      BYTE_CAP,
    );
    const result = Events.parse(JSON.parse(raw.text));
    expect(result.truncated).toBe(true);
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.events.length).toBeLessThan(40);
    expect(result.events[0]?.id).toBe(hex32("c00"));
  });

  test("a single event over the byte cap gives no events and truncated, not a tool error", async () => {
    const log = makeLog([
      event("d0", { data: { note: "x".repeat(BYTE_CAP + 10) } }),
    ]);
    const result = Events.parse(await json(log, "find_events"));
    expect(result.events).toEqual([]);
    expect(result.truncated).toBe(true);
  });

  test("a result under both caps says it was not truncated", async () => {
    const log = makeLog([event("e0")]);
    expect(Events.parse(await json(log, "find_events")).truncated).toBe(false);
  });
});
