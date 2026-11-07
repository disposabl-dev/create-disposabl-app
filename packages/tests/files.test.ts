import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  upload,
  getDownload,
  getOwned,
  remove,
} from "../disposabl-kit/server/files-functions";
import { env } from "../backend/convex/_generated/server";
import { MAX_UPLOAD_BYTES } from "../disposabl-kit/server/files";

const testEnv = env as Record<string, string | undefined>;
const keys = [
  "R2_ACCOUNT_ID",
  "R2_BUCKET_NAME",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
] as const;
const saved = Object.fromEntries(keys.map((key) => [key, testEnv[key]]));
const originalFetch = globalThis.fetch;
afterEach(() => {
  for (const key of keys) {
    if (saved[key] === undefined) delete testEnv[key];
    else testEnv[key] = saved[key];
  }
  globalThis.fetch = originalFetch;
});
const configured = () => {
  for (const [i, key] of keys.entries())
    testEnv[key] = ["account", "bucket", "access", "secret"][i];
};
const args = {
  filename: "a.txt",
  mediaType: "text/plain",
  bytes: new Uint8Array([1, 2]).buffer,
};
const auth = { getUserIdentity: async () => ({ subject: "session" }) };
const ownerSession = async () => ({ userId: "owner" });
const run = (fn: unknown, ctx: unknown, args: unknown) =>
  (
    fn as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> }
  )._handler(ctx, args);

test("missing or partial configuration stores in Convex and validates bytes", async () => {
  for (const key of keys) delete testEnv[key];
  testEnv.R2_ACCOUNT_ID = "account";
  let stored = 0;
  let record: any;
  const ctx = {
    auth,
    runQuery: ownerSession,
    storage: {
      store: async () => {
        stored++;
        return "storage";
      },
      delete: async () => {},
    },
    runMutation: async (_ref: unknown, value: unknown) => {
      record = value;
      return "file";
    },
  };
  assert.equal(await run(upload, ctx, args), "file");
  assert.equal(stored, 1);
  assert.equal(record.location.provider, "convex");
  assert.equal(record.size, 2);
  await assert.rejects(
    run(upload, ctx, { ...args, bytes: new ArrayBuffer(MAX_UPLOAD_BYTES + 1) }),
    /5 MiB/,
  );
  assert.equal(stored, 1);
});

test("configured uploads write R2 and never fall back after an error", async () => {
  configured();
  let record: any;
  let stores = 0;
  const requests: Request[] = [];
  globalThis.fetch = async (request) => {
    requests.push(request as Request);
    return new Response(null, { status: 200 });
  };
  const ctx = {
    auth,
    runQuery: ownerSession,
    storage: {
      store: async () => {
        stores++;
        return "storage";
      },
    },
    runMutation: async (_ref: unknown, value: unknown) => {
      record = value;
      return "file";
    },
  };
  await run(upload, ctx, args);
  assert.equal(record.location.provider, "r2");
  assert.match(record.location.key, /^[0-9a-f-]{36}$/);
  assert.equal(requests[0].method, "PUT");
  globalThis.fetch = async () => new Response(null, { status: 403 });
  await assert.rejects(run(upload, ctx, args), /R2 upload failed/);
  assert.equal(stores, 0);
});

test("ownership guard and per-record provider survive configuration changes", async () => {
  const file = {
    _id: "file",
    _creationTime: 0,
    owner: "owner",
    filename: "a",
    mediaType: "text/plain",
    size: 2,
    location: { provider: "convex", storageId: "storage" },
  };
  await assert.rejects(
    run(
      getOwned,
      {
        auth,
        runQuery: async () => ({ userId: "other" }),
        db: { get: async () => file },
      },
      { id: "file" },
    ),
    /File not found/,
  );
  configured();
  const ctx = {
    runQuery: async () => file,
    storage: { getUrl: async () => "convex-url" },
  };
  assert.equal(
    ((await run(getDownload, ctx, { id: "file" })) as { url: string }).url,
    "convex-url",
  );
  file.location = {
    provider: "r2",
    key: "key",
    account: "account",
    bucket: "bucket",
  } as any;
  const signed = (await run(getDownload, ctx, { id: "file" })) as {
    url: string;
  };
  assert.equal(new URL(signed.url).searchParams.get("X-Amz-Expires"), "300");
  assert.ok(!signed.url.includes("secret"));
  testEnv.R2_BUCKET_NAME = "other-bucket";
  await assert.rejects(
    run(getDownload, ctx, { id: "file" }),
    /R2 access configuration/,
  );
  delete testEnv.R2_SECRET_ACCESS_KEY;
  await assert.rejects(
    run(getDownload, ctx, { id: "file" }),
    /R2 access configuration/,
  );
});

test("registration failure removes the written object and failed delete retains metadata", async () => {
  for (const key of keys) delete testEnv[key];
  let cleaned = 0;
  const ctx = {
    auth,
    runQuery: ownerSession,
    storage: {
      store: async () => "storage",
      delete: async () => {
        cleaned++;
      },
    },
    runMutation: async () => {
      throw new Error("registration failed");
    },
  };
  await assert.rejects(run(upload, ctx, args), /registration failed/);
  assert.equal(cleaned, 1);
  let forgotten = false;
  const removeCtx = {
    runQuery: async () => ({
      location: { provider: "convex", storageId: "storage" },
    }),
    storage: {
      delete: async () => {
        throw new Error("delete failed");
      },
    },
    runMutation: async () => {
      forgotten = true;
    },
  };
  await assert.rejects(run(remove, removeCtx, { id: "file" }), /delete failed/);
  assert.equal(forgotten, false);
});

test("R2 rollback deletes the generated key and failed R2 deletion keeps the record", async () => {
  configured();
  const methods: string[] = [];
  globalThis.fetch = async (request) => {
    methods.push((request as Request).method);
    return new Response(null, { status: 200 });
  };
  const ctx = {
    auth,
    runQuery: ownerSession,
    storage: {},
    runMutation: async () => {
      throw new Error("registration failed");
    },
  };
  await assert.rejects(run(upload, ctx, args), /registration failed/);
  assert.deepEqual(methods, ["PUT", "DELETE"]);
  globalThis.fetch = async () => new Response(null, { status: 403 });
  let forgotten = false;
  const removeCtx = {
    runQuery: async () => ({
      location: {
        provider: "r2",
        key: "key",
        account: "account",
        bucket: "bucket",
      },
    }),
    runMutation: async () => {
      forgotten = true;
    },
  };
  await assert.rejects(
    run(remove, removeCtx, { id: "file" }),
    /R2 delete failed/,
  );
  assert.equal(forgotten, false);
});
