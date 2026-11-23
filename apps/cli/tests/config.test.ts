// Where the factory's log is by default, exactly as orc's events.path() puts it, and the key.

import { homedir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";

import { loadConfig } from "../src/config.ts";

test("the default log is under XDG_STATE_HOME when it is set", () => {
  expect(
    loadConfig({ XDG_STATE_HOME: "/state", HOME: "/home/x" }).defaultLogPath,
  ).toBe("/state/orc/events.db");
});

test("the default log is under ~/.local/state when XDG_STATE_HOME is unset or empty", () => {
  expect(loadConfig({ HOME: "/home/x" }).defaultLogPath).toBe(
    "/home/x/.local/state/orc/events.db",
  );
  expect(
    loadConfig({ XDG_STATE_HOME: "", HOME: "/home/x" }).defaultLogPath,
  ).toBe("/home/x/.local/state/orc/events.db");
});

test("the home folder comes from the system when HOME is unset", () => {
  expect(loadConfig({}).defaultLogPath).toBe(
    join(homedir(), ".local", "state", "orc", "events.db"),
  );
});

test("an empty ANTHROPIC_API_KEY counts as unset", () => {
  expect(loadConfig({ ANTHROPIC_API_KEY: "" }).apiKey).toBeUndefined();
  expect(loadConfig({ ANTHROPIC_API_KEY: "sk-ant-x" }).apiKey).toBe("sk-ant-x");
});
