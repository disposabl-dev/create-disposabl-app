import { test, expect } from "bun:test";
import {
  insertAuthorizationRequest,
  claimAuthorizationRequest,
  insertTicket,
  claimTicket,
} from "./package/src/lib/oauth/dbHelpers.ts";

test("server-owned authorization start survives delayed callback and fresh flow", async () => {
  const oldDate = Date.now,
    oldSite = process.env.CONVEX_SITE_URL;
  let now = 1000;
  Date.now = () => now;
  process.env.CONVEX_SITE_URL = "https://fixture.convex.site";
  const rows = new Map<string, any>();
  let n = 0;
  const ctx = {
    db: {
      insert: async (table: string, value: any) => {
        const id = String(++n);
        rows.set(id, { ...value, _id: id, table });
        return id;
      },
      delete: async (_table: string, id: string) => {
        rows.delete(id);
      },
      query: (table: string) => ({
        withIndex: (_name: string, filter: any) => {
          let key = "",
            value = "";
          filter({
            eq: (k: string, v: string) => {
              key = k;
              value = v;
              return {};
            },
          });
          return {
            unique: async () =>
              [...rows.values()].find(
                (r) => r.table === table && r[key] === value,
              ) ?? null,
          };
        },
      }),
    },
  } as any;
  try {
    async function begin(state: string) {
      await insertAuthorizationRequest(ctx, {
        stateHash: state,
        redirectTo: "https://fixture.test",
        codeVerifier: "verifier",
      } as any);
    }
    async function callback(state: string) {
      const r = await claimAuthorizationRequest(ctx, state);
      if (!r || r.expired) throw new Error("missing request");
      await insertTicket(ctx, {
        stateHash: state,
        ticketCodeHash: `ticket-${state}`,
        encryptedPayload: "fixture",
        ...(r.doc.authorizationStartedAt === undefined
          ? {}
          : { authorizationStartedAt: r.doc.authorizationStartedAt }),
      } as any);
    }
    await begin("old");
    now = 2000;
    await callback("old");
    await begin("new");
    now = 3000;
    await callback("new");
    expect(
      (
        await claimTicket(ctx, {
          stateHash: "old",
          ticketCodeHash: "ticket-old",
        })
      )?.authorizationStartedAt,
    ).toBe(1000);
    expect(
      (
        await claimTicket(ctx, {
          stateHash: "new",
          ticketCodeHash: "ticket-new",
        })
      )?.authorizationStartedAt,
    ).toBe(2000);
    await insertTicket(ctx, {
      stateHash: "legacy",
      ticketCodeHash: "legacy",
      encryptedPayload: "fixture",
    } as any);
    expect(
      (
        await claimTicket(ctx, {
          stateHash: "legacy",
          ticketCodeHash: "legacy",
        })
      )?.authorizationStartedAt,
    ).toBeUndefined();
  } finally {
    Date.now = oldDate;
    if (oldSite === undefined) delete process.env.CONVEX_SITE_URL;
    else process.env.CONVEX_SITE_URL = oldSite;
  }
});

test("callback carries server request marker through inert exchange", async () => {
  const { runCallback } = await import("./package/src/lib/oauth/callback.ts");
  const previous = globalThis.fetch;
  let verifier = "",
    calls = 0;
  globalThis.fetch = async (_input, init) => {
    calls++;
    if (calls % 2 === 1) {
      verifier =
        new URLSearchParams(init?.body as string).get("code_verifier") ?? "";
      return Response.json({ access_token: "fixture" });
    }
    return Response.json({ id: "synthetic" });
  };
  try {
    for (const startedAt of [1000, 2000, undefined]) {
      let minted: any;
      const response = await runCallback({
        path: "/oauth/google/callback",
        params: {
          state: "fixture-state",
          code: "fixture-code",
          error: null,
          errorDescription: null,
        },
        claim: async () => ({
          expired: false,
          stateHash: "server-state-hash",
          redirectTo: "https://fixture.test/return",
          callbackUrl: "https://fixture.convex.site/oauth/google/callback",
          codeVerifier: "server-verifier",
          ...(startedAt === undefined
            ? {}
            : { authorizationStartedAt: startedAt }),
        }),
        mintTicket: async (_request, ticket) => {
          minted = ticket;
          return null;
        },
        exchangeConfig: () => ({
          providerName: "fixture",
          tokenEndpoint: "https://fixture.test/token",
          clientId: "fixture",
          clientSecret: () => "fixture",
          userInfoEndpoints: { profile: "https://fixture.test/user" },
        }),
        redirectStatus: 302,
      });
      expect(response.status).toBe(302);
      expect(minted.authorizationStartedAt).toBe(startedAt);
      expect(verifier).toBe("server-verifier");
    }
    expect(calls).toBe(6);
  } finally {
    globalThis.fetch = previous;
  }
});

test("Google authorization creation validator does not accept a client marker", async () => {
  const { createAuthorizationRequest } =
    await import("./package/src/components/google/provider.ts");
  const args = JSON.parse((createAuthorizationRequest as any).exportArgs());
  expect(Object.keys(args.value).sort()).toEqual([
    "codeVerifier",
    "redirectTo",
    "stateHash",
  ]);
});
