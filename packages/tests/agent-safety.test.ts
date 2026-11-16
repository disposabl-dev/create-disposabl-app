import { CONSENT_VERSION } from "../backend/convex/agent/disclosure";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  consented,
  requireConsent,
  createReport,
  resolveReport,
} from "../backend/convex/agent/safety";

test("AI sharing is denied until the owner grants the current version", async () => {
  const records = new Map<string, { granted: boolean; version: string }>();
  const ctx: any = {
    db: {
      query: () => ({
        withIndex: (_: unknown, f: any) => {
          let owner = "";
          f({
            eq: (_: string, value: string) => {
              owner = value;
              return {};
            },
          });
          return { unique: async () => records.get(owner) ?? null };
        },
      }),
    },
  };
  await assert.rejects(requireConsent(ctx, "alice"), /permission is required/);
  records.set("alice", { granted: false, version: CONSENT_VERSION });
  await assert.rejects(requireConsent(ctx, "alice"), /permission is required/);
  records.set("alice", { granted: true, version: "old" });
  assert.equal(await consented(ctx, "alice"), false);
  records.set("alice", { granted: true, version: CONSENT_VERSION });
  await requireConsent(ctx, "alice");
  await assert.rejects(requireConsent(ctx, "bob"), /permission is required/);
  records.set("alice", { granted: false, version: CONSENT_VERSION });
  await assert.rejects(requireConsent(ctx, "alice"), /permission is required/);
});

test("reports bind an owned assistant message and can be resolved", async () => {
  const reports = new Map<string, any>();
  const appId = "12345678-1234-4234-8234-123456789abc";
  let message: any = { threadId: "thread", message: { role: "assistant" } };
  const ctx: any = {
    db: {
      query: () => ({
        withIndex: () => ({
          unique: async () => ({
            userId: "alice",
            agent: { threadId: "thread" },
          }),
        }),
      }),
      insert: async (_: string, row: any) => {
        reports.set("report", row);
        return "report";
      },
      get: async (_: string, id: string) => reports.get(id),
      patch: async (_: string, id: string, patch: any) => {
        Object.assign(reports.get(id), patch);
      },
    },
    runQuery: async () => [message],
  };
  const args = { appId, messageId: "message", reason: "offensive" as const };
  await assert.rejects(createReport(ctx, "bob", args), /App not found/);
  message.threadId = "other";
  await assert.rejects(
    createReport(ctx, "alice", args),
    /Response unavailable/,
  );
  message = { threadId: "thread", message: { role: "user" } };
  await assert.rejects(
    createReport(ctx, "alice", args),
    /Response unavailable/,
  );
  message.message.role = "assistant";
  assert.equal(await createReport(ctx, "alice", args), "report");
  assert.deepEqual(reports.get("report"), {
    userId: "alice",
    appId,
    threadId: "thread",
    messageId: "message",
    reason: "offensive",
    status: "open",
  });
  await (resolveReport as any)._handler(ctx, {
    id: "report",
    operator: "moderator",
  });
  assert.equal(reports.get("report").status, "resolved");
  await assert.rejects(
    (resolveReport as any)._handler(ctx, {
      id: "report",
      operator: "moderator",
    }),
    /Open report not found/,
  );
});
