import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const url = process.env.TELEMETRY_GUARD_FIXTURE_URL;
if (url && url !== "http://127.0.0.1:3530")
  throw new Error("Fixture requires loopback 3530");
async function call(name: string, args: object, query = false): Promise<any> {
  const response = await fetch(`${url}/api/${query ? "query" : "mutation"}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: `fixture:${name}`, args, format: "json" }),
  });
  const result = (await response.json()) as any;
  if (result.status !== "success") throw new Error(result.errorMessage);
  return result.value;
}
test(
  "real transactions fence pending and missing owners, preserve anonymous and starter behavior",
  { skip: !url },
  async () => {
    const pending = await call("create", {}),
      other = await call("create", {}),
      missing = await call("create", {});
    await call("request", { userId: pending });
    await call("removeUser", { userId: missing });
    const before = await call("rows", {}, true);
    for (const userId of [pending, missing, "invalid"])
      await assert.rejects(call("claim", { userId, newHash: randomUUID() }));
    assert.deepEqual(await call("rows", {}, true), before);
    assert.equal(
      await call("claim", { userId: other, newHash: randomUUID() }),
      false,
    );
    assert.equal(await call("claim", { newHash: randomUUID() }), false);
    assert.equal(
      await call("claim", {
        userId: pending,
        newHash: randomUUID(),
        generic: true,
      }),
      false,
    );
  },
);
test(
  "concurrent deletion and claim or anonymous binding serialize, with no post-request recreation",
  { skip: !url },
  async () => {
    for (const bind of [false, true])
      for (let i = 0; i < 6; i++) {
        const userId = await call("create", {}),
          hash = randomUUID(),
          next = randomUUID();
        if (bind) await call("claim", { newHash: hash });
        const [request] = await Promise.allSettled([
          call("request", { userId }),
          call("claim", { userId, ...(bind ? { hash } : {}), newHash: next }),
        ]);
        assert.equal(request.status, "fulfilled");
        const rows = await call("rows", {}, true);
        for (const row of rows.identities.filter(
          (x: any) => x.userId === userId,
        ))
          await call("clear", { hash: row.hash });
        const before = await call("rows", {}, true);
        await assert.rejects(
          call("claim", { userId, ...(bind ? { hash } : {}), newHash: next }),
        );
        assert.deepEqual(await call("rows", {}, true), before);
      }
  },
);
