import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchCurrentUpdate } from "../disposabl-kit/mobile/updates/current-update";
import { foregroundCheck } from "../disposabl-kit/mobile/updates/foreground-check";

test("only a long inactive interval triggers a foreground download", () => {
  let time = 0;
  let checks = 0;
  const change = foregroundCheck(
    () => checks++,
    "active",
    () => time,
  );
  time = 600_000;
  change("active");
  assert.equal(checks, 0);
  change("inactive");
  time += 1_000;
  change("active");
  assert.equal(checks, 0);
  change("inactive");
  time += 100_000;
  change("background");
  time += 200_000;
  change("active");
  assert.equal(checks, 1);
  change("active");
  assert.equal(checks, 1);
});

test("an app mounted in the background waits until a long interval ends", () => {
  let time = 0;
  let checks = 0;
  const change = foregroundCheck(
    () => checks++,
    "background",
    () => time,
  );
  time = 300_000;
  assert.equal(checks, 0);
  change("active");
  assert.equal(checks, 1);
});

test("an unavailable update response does not fetch or authorize restart", async () => {
  let downloads = 0;
  const result = await fetchCurrentUpdate(
    async () => ({ isAvailable: false, isRollBackToEmbedded: false }),
    async () => {
      downloads++;
      return { isNew: true, isRollBackToEmbedded: false };
    },
    false,
  );
  assert.equal(result, "unavailable");
  assert.equal(downloads, 0);
});

test("a compatible downloaded update is ready to launch", async () => {
  assert.equal(
    await fetchCurrentUpdate(
      async () => ({ isAvailable: true, isRollBackToEmbedded: false }),
      async () => ({ isNew: true, isRollBackToEmbedded: false }),
      true,
    ),
    "ready",
  );
});

test("a rollback received between check and fetch replaces the advertised update", async () => {
  assert.equal(
    await fetchCurrentUpdate(
      async () => ({ isAvailable: true, isRollBackToEmbedded: false }),
      async () => ({ isNew: false, isRollBackToEmbedded: true }),
      false,
    ),
    "ready",
  );
});

test("rollback on an embedded launch is persisted without a pointless restart", async () => {
  let persisted = false;
  const result = await fetchCurrentUpdate(
    async () => ({ isAvailable: false, isRollBackToEmbedded: true }),
    async () => {
      persisted = true;
      return { isNew: false, isRollBackToEmbedded: true };
    },
    true,
  );
  assert.equal(persisted, true);
  assert.equal(result, "rollback");
});

test("withdrawal between check and fetch cannot authorize restart", async () => {
  assert.equal(
    await fetchCurrentUpdate(
      async () => ({ isAvailable: true, isRollBackToEmbedded: false }),
      async () => ({ isNew: false, isRollBackToEmbedded: false }),
      false,
    ),
    "unavailable",
  );
});

test("offline checks fail without attempting to fetch a cached update", async () => {
  let downloads = 0;
  await assert.rejects(
    fetchCurrentUpdate(
      async () => {
        throw new Error("Offline");
      },
      async () => {
        downloads++;
        return { isNew: true, isRollBackToEmbedded: false };
      },
      false,
    ),
    /Offline/,
  );
  assert.equal(downloads, 0);
});
