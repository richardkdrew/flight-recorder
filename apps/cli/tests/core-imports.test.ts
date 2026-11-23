// The core stays runtime-free (ADR 0001): it imports only its own files and zod. Its tsconfig's `types: []`
// catches Node's globals only while no import brings Node's types in, and the Anthropic SDK's types do
// (through undici-types), so the SDK is wired in by the CLI instead.

import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

const CORE = new URL("../../../packages/core/src/", import.meta.url);
const IMPORT = /^\s*(?:import|export)\b[^"']*?\bfrom\s+["']([^"']+)["']/gm;
const ALLOWED = new Set(["zod"]);

test("the core imports nothing but its own files and zod", () => {
  const files = readdirSync(CORE).filter((name) => name.endsWith(".ts"));
  expect(files.length).toBeGreaterThan(0);
  for (const name of files) {
    const text = readFileSync(new URL(name, CORE), "utf8");
    for (const [, specifier = ""] of text.matchAll(IMPORT)) {
      const ok = specifier.startsWith("./") || ALLOWED.has(specifier);
      expect(ok, `${name} imports ${specifier}`).toBe(true);
    }
  }
});
