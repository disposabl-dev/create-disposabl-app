import { test } from "node:test";
import assert from "node:assert/strict";
import { inspect, redeem } from "../backend/convex/browserHandoff";
import { createUser, onSignIn } from "../backend/convex/users/internal";
import { AuthClient } from "@convex-dev/auth/browser";

const code = "Q".repeat(43);

test("a delayed refresh in another tab cannot overwrite the selected account", async () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  const session = (userId: string) => ({
    userId,
    accessToken: `access-${userId}`,
    refreshToken: `refresh-${userId}`,
    refreshTokenExpiresAt: Date.now() + 60_000,
  });
  let notifyStarted!: () => void;
  let releaseRefresh!: () => void;
  const started = new Promise<void>((resolve) => {
    notifyStarted = resolve;
  });
  const release = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  const config = {
    mode: "spa" as const,
    storage,
    storageNamespace: "handoff-race",
    authApi: {
      signOut: async () => {},
      refreshSession: async () => {
        notifyStarted();
        await release;
        return { kind: "rotated" as const, tokens: session("old-refreshed") };
      },
    },
  };
  const oldTab = new AuthClient(config);
  await oldTab.init();
  await oldTab.setSession(session("old"));
  const handoffTab = new AuthClient(config);
  await handoffTab.init();
  const refresh = oldTab.fetchAccessToken({ forceRefreshToken: true });
  await started;
  const adopt = handoffTab.setSession(session("selected"));
  releaseRefresh();
  await Promise.all([refresh, adopt]);
  const restarted = new AuthClient(config);
  await restarted.init();
  assert.equal(restarted.getAccessToken(), "access-selected");
  assert.equal(handoffTab.getAccessToken(), "access-selected");
  oldTab.dispose();
  handoffTab.dispose();
  restarted.dispose();
});
function context(expiresAt: number) {
  let exchanges = 0;
  const ctx = {
    db: {
      query: () => ({
        withIndex: () => ({
          unique: async () => ({
            _id: "owner",
            browserHandoff: { sessionId: "mobile-session", expiresAt },
          }),
        }),
      }),
      patch: async () => {},
    },
    runMutation: async () => {
      exchanges++;
      return {};
    },
  };
  return { ctx, exchanges: () => exchanges };
}
test("expired and malformed browser handoffs cannot issue sessions", async () => {
  for (const value of [code, "malformed"]) {
    const fixture = context(Date.now() - 1);
    await assert.rejects(
      (redeem as any)._handler(fixture.ctx, { code: value }),
      /expired/,
    );
    assert.equal(fixture.exchanges(), 0);
  }
});

test("handoff confirms a verified Google or email identity, never a generic account", async () => {
  for (const profile of [{ email: "google@example.com" }, undefined]) {
    const fixture = context(Date.now() + 60_000);
    const row = await fixture.ctx.db.query().withIndex().unique();
    const responses = [{ userId: "owner" }, null, null];
    fixture.ctx.db.query = () => ({
      withIndex: () => ({ unique: async () => ({ ...row, profile }) }),
    });
    const result = await (inspect as any)._handler(
      { ...fixture.ctx, runQuery: async () => responses.shift() },
      { code },
    );
    assert.deepEqual(result, { userId: "owner", name: profile?.email ?? null });
  }
});

test("Google sign-in stores provider identity and excludes unverified email", async () => {
  for (const emailVerified of [true, false]) {
    const saved: unknown[] = [];
    const ctx = {
      db: {
        insert: async (_: string, value: unknown) => {
          saved.push(value);
          return "owner";
        },
        patch: async (_: string, _id: string, value: unknown) => {
          saved.push(value);
        },
      },
    };
    const provider = {
      name: "google",
      accountId: "google-account",
      profile: {
        id: "google-account",
        email: "google@example.com",
        emailVerified,
        name: "Google User",
      },
    };
    await (createUser as any)._handler(ctx, { provider });
    await (onSignIn as any)._handler(ctx, { userId: "owner", provider });
    assert.deepEqual(
      saved,
      [0, 1].map(() => ({
        profile: {
          name: "Google User",
          ...(emailVerified ? { email: "google@example.com" } : {}),
        },
      })),
    );
  }
});
