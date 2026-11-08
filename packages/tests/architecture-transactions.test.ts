import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const url = process.env.ARCHITECTURE_FIXTURE_URL;
if (url && !["http://127.0.0.1:3500", "http://localhost:3500"].includes(url))
  throw new Error("Architecture fixture requires loopback port 3500");
async function call(name: string, args: object, query = false): Promise<any> {
  const response = await fetch(`${url}/api/${query ? "query" : "mutation"}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: `fixture:${name}`, args, format: "json" }),
  });
  const result = (await response.json()) as any;
  if (result.status !== "success")
    throw new Error(result.errorMessage ?? JSON.stringify(result));
  return result.value;
}
test(
  "real transactions fence and consume architecture completion",
  { skip: !url },
  async () => {
    const appId = randomUUID(),
      userId = "owner",
      until = Date.now() + 60000;
    const identity = { appId, userId, until };
    const state = () => call("state", { appId }, true);
    await call("create", identity);
    await call("stageSelection", {
      ...identity,
      androidArchitectures: ["x86_64"],
    });
    assert.deepEqual((await state()).androidArchitectures, ["arm64-v8a"]);
    await assert.rejects(call("finish", { ...identity, userId: "other" }));
    assert.deepEqual((await state()).androidArchitectures, ["arm64-v8a"]);
    await call("ordinaryPreview", identity);
    assert.deepEqual((await state()).androidArchitectures, ["arm64-v8a"]);
    const expired = Date.now() - 1000;
    await call("replaceLease", { appId, until: expired, keepStaged: true });
    await assert.rejects(call("finish", identity));
    await assert.rejects(call("finish", { ...identity, until: expired }));
    assert.deepEqual((await state()).androidArchitectures, ["arm64-v8a"]);
    const next = until + 1000;
    await call("replaceLease", { appId, until: next });
    await call("stageSelection", {
      ...identity,
      until: next,
      androidArchitectures: ["x86_64"],
    });
    await assert.rejects(call("finish", identity));
    const results = await Promise.allSettled([
      call("finish", { ...identity, until: next }),
      call("finish", { ...identity, until: next }),
    ]);
    assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(results.filter((x) => x.status === "rejected").length, 1);
    const saved = await state();
    assert.deepEqual(saved.androidArchitectures, ["x86_64"]);
    assert.equal(saved.operation, undefined);
  },
);
