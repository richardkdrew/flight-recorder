// AC17: after `flight seed <file>`, `flight retro --log <file>` covers exactly reading-stats, tide-alerts and
// dark-mode, in that order; tide-alerts' table has its rules stop and its counts line has `rule stops: 1`,
// and its friction note is under it while the note with no project is under `## Other friction notes`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import { notEnoughData } from "./fixtures/replies.ts";
import { OTHER, changeHeadings, retro, sectionOf, tableRows, TABLE_HEADER } from "./retro-support.ts";
import { envFor, flight, show, tempDir, type Run } from "./support.ts";

const TIDE_ALERTS = "tide-alerts (tide-tables)";

async function seededRetro(): Promise<Run> {
  const dir = tempDir();
  const env = envFor(join(dir, "home"), join(dir, "state"));
  const file = join(dir, "seeded.db");
  const seeded = await flight(["seed", file], { env });
  assert.equal(seeded.code, 0, `flight seed should exit 0\n${show(seeded)}`);
  const run = await retro(["--log", file], {
    env,
    replies: [notEnoughData("more accepted changes from each factory version")],
  });
  assert.equal(run.code, 0, show(run));
  assert.equal(run.requests.length, 1, `the retro should send one request\n${show(run)}`);
  return run;
}

test("AC17 the seeded log's retro covers exactly reading-stats, tide-alerts and dark-mode, in that order", async () => {
  const run = await seededRetro();
  assert.deepEqual(
    changeHeadings(run.stdout),
    ["reading-stats (paper-lantern)", TIDE_ALERTS, "dark-mode (paper-lantern)"],
    show(run),
  );
  for (const change of ["station-search", "import-bookmarks", "offline-cache"]) {
    assert.ok(!changeHeadings(run.stdout).some((h) => h.startsWith(`${change} `)), `${change} has a section\n${show(run)}`);
  }
});

test("AC17 tide-alerts' table has the row escalated: rules (1), da640d83…, allowed, 3db783e8…, 18 h 39 min", async () => {
  const run = await seededRetro();
  const rows = tableRows(sectionOf(run, TIDE_ALERTS));
  assert.ok(rows, `tide-alerts' section has no table with the columns ${TABLE_HEADER.join(" | ")}\n${show(run)}`);
  const expected = ["escalated: rules (1)", "da640d83103eb43bedc8dd972aa6cdca", "allowed", "3db783e8a6f63e9271adb1a7a539c903", "18 h 39 min"];
  assert.ok(
    rows.some((row) => JSON.stringify(row) === JSON.stringify(expected)),
    `tide-alerts' table has no row ${expected.join(" | ")}\n${show(run)}`,
  );
});

test("AC17 tide-alerts' counts line has rule stops: 1", async () => {
  const run = await seededRetro();
  const counts = sectionOf(run, TIDE_ALERTS).lines.filter((l) => l.trim().startsWith("build attempts:"));
  assert.equal(counts.length, 1, `tide-alerts' section should have one counts line\n${show(run)}`);
  assert.ok(counts[0]!.includes("rule stops: 1"), `tide-alerts' counts line should have "rule stops: 1": ${counts[0]}`);
});

test("AC17 note 2b00fbfd… is under tide-alerts and note 6e92651a… under '## Other friction notes'", async () => {
  const run = await seededRetro();
  assert.ok(
    sectionOf(run, TIDE_ALERTS).lines.some((l) => l.includes("2b00fbfddd465d1e8b9d3f19445dc37e")),
    `note 2b00fbfddd465d1e8b9d3f19445dc37e is not under tide-alerts\n${show(run)}`,
  );
  assert.ok(
    sectionOf(run, OTHER).lines.some((l) => l.includes("6e92651aa7daee50ce0f553c5c3b4976")),
    `note 6e92651aa7daee50ce0f553c5c3b4976 is not under "## ${OTHER}"\n${show(run)}`,
  );
});
