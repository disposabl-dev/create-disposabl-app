import assert from "node:assert/strict";
import { test } from "node:test";
import { requireConnections } from "../backend/convex/connections/config";

const ready = {
  github: { owner: "owner", organization: false },
  convex: { name: "convex" },
  expo: null,
  posthog: null,
  autumn: null,
  posthogPending: false,
  ready: true,
  missing: [],
  connectionsUrl: "https://example.com/dashboard/connections",
  available: {
    github: true,
    convex: true,
    expo: true,
    posthog: true,
    autumn: true,
  },
  githubInstallUrl: null,
} as const;

test("Expo is required only for selected mobile platforms", () => {
  assert.doesNotThrow(() =>
    requireConnections({ ...ready, missing: [] }, ["web"]),
  );
  for (const platform of ["android", "ios"]) {
    assert.throws(
      () => requireConnections({ ...ready, missing: [] }, ["web", platform]),
      (error: unknown) => {
        assert.ok(error && typeof error === "object" && "data" in error);
        const data = error.data as {
          missing: string[];
          connectionsUrl: string;
        };
        assert.deepEqual(data.missing, ["expo"]);
        assert.equal(
          new URL(data.connectionsUrl).searchParams.get("mobile"),
          "1",
        );
        return true;
      },
    );
  }
  assert.doesNotThrow(() =>
    requireConnections({ ...ready, missing: [], expo: { name: "expo" } }, [
      "ios",
    ]),
  );
});

test("mobile and feature prerequisites are reported together", () => {
  assert.throws(
    () =>
      requireConnections({ ...ready, ready: false, missing: ["posthog"] }, [
        "android",
      ]),
    (error: unknown) => {
      assert.ok(error && typeof error === "object" && "data" in error);
      assert.deepEqual((error.data as { missing: string[] }).missing, [
        "posthog",
        "expo",
      ]);
      return true;
    },
  );
});
