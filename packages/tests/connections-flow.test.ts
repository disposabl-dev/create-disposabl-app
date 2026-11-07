import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  setupContext,
  completeConnections,
  connectionsSeen,
  sessionId,
} from "../../apps/web/src/components/connections/flow-state";

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}
const token = (sub: string, iat: number) =>
  `header.${btoa(JSON.stringify({ sub, iat }))}.signature`;

describe("connection presentation", () => {
  test("completion follows the auth session, including token refresh", () => {
    const store = storage();
    const first = sessionId(token("session-1", 1));
    assert.equal(connectionsSeen(store, first), false);
    completeConnections(store, first);
    assert.equal(
      connectionsSeen(store, sessionId(token("session-1", 2))),
      true,
    );
    assert.equal(
      connectionsSeen(store, sessionId(token("session-2", 3))),
      false,
    );
    assert.equal(sessionId("invalid"), null);
  });
  test("CLI requirements survive callback cleanup and refresh until completion", () => {
    const store = storage();
    const read = (query = "") =>
      setupContext(
        store,
        new URL(`https://example.com/dashboard/connections${query}`),
      );
    const expected = {
      fromCli: true,
      analytics: true,
      mobile: true,
      payments: true,
    };
    assert.deepEqual(
      read("?origin=cli&features=analytics,payments&mobile=1"),
      expected,
    );
    assert.deepEqual(read("?code=x&state=y"), expected);
    assert.deepEqual(read(), expected);
    completeConnections(store, "session-1");
    assert.deepEqual(read(), {
      fromCli: false,
      analytics: false,
      payments: false,
      mobile: false,
    });
  });
  test("a new explicit setup replaces earlier requirements", () => {
    const store = storage();
    setupContext(
      store,
      new URL(
        "https://example.com?origin=cli&features=analytics,payments&mobile=1",
      ),
    );
    assert.deepEqual(
      setupContext(store, new URL("https://example.com?mobile=1")),
      {
        fromCli: false,
        analytics: false,
        payments: false,
        mobile: true,
      },
    );
  });
});
