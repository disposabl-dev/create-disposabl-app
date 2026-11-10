import { test } from "node:test";
import assert from "node:assert/strict";
import { getFunctionName } from "convex/server";
import { stopSandbox } from "../backend/convex/agent/actions/compute";

function fixture(
  record: unknown,
  results: Array<unknown> = [],
  interruptError?: Error,
) {
  const calls: { name: string; args: any }[] = [];
  let actions = 0;
  const order: string[] = [];
  const ctx: any = {
    runQuery: async (ref: any) => {
      try {
        if (getFunctionName(ref) === "agent/compute:get")
          return { userId: "owner" };
      } catch {
        // Component function references are not application function references.
      }
      return record;
    },
    runMutation: async (ref: any, args: any) => {
      const name = getFunctionName(ref);
      calls.push({ name, args });
      if (name === "agent/compute:stopping") return true;
      if (name === "agent/compute:stopped") return null;
      throw new Error("Unexpected mutation");
    },
    runAction: async () => {
      order.push(actions === 0 ? "refresh" : "stop");
      const result = results[actions++];
      if (result instanceof Error) throw result;
      if (!result) throw new Error("Unexpected provider action");
      return { sandboxId: "synthetic", ...(result as object) };
    },
  };
  return {
    ctx,
    calls,
    order,
    run: () =>
      stopSandbox(ctx, "session" as any, async (id) => {
        assert.equal(id, "synthetic");
        order.push("interrupt-all");
        if (interruptError) throw interruptError;
        return {};
      }),
    actions: () => actions,
    result: () =>
      calls.find((call) => call.name === "agent/compute:stopped")?.args,
  };
}

test("missing Boat record or sandbox ID cannot confirm a stop", async () => {
  for (const record of [null, { state: "archived" }, { sandboxId: "" }]) {
    const f = fixture(record);
    await f.run();
    assert.equal(f.result()?.archived, false);
    assert.equal(f.actions(), 0);
    assert.equal(f.calls[0].args.token, f.result()?.token);
  }
});

test("only a confirmed archived response records a stop", async () => {
  for (const [results, expected] of [
    [[{ state: "archived" }], true],
    [[{ state: "ready" }, { state: "archived" }], true],
    [[{ state: "ready" }, { state: "ready" }], false],
    [[new Error("unconfirmed")], false],
    [[{ state: "ready" }, new Error("unconfirmed stop")], false],
  ] as const) {
    const f = fixture({ sandboxId: "synthetic" }, [...results]);
    await f.run();
    assert.equal(f.result()?.archived, expected);
  }
});

test("expired shared sandbox interrupts every conversation before preserving stop", async () => {
  const f = fixture({ sandboxId: "synthetic" }, [
    { state: "ready" },
    { state: "archived" },
  ]);
  await f.run();
  assert.deepEqual(f.order, ["refresh", "interrupt-all", "stop"]);
  assert.equal(f.result().archived, true);
});

test("interrupt errors and timeouts still attempt normal stop without confirming failure", async () => {
  for (const error of [
    new Error("interrupt failed"),
    new DOMException("timeout", "TimeoutError"),
  ]) {
    const f = fixture(
      { sandboxId: "synthetic" },
      [{ state: "ready" }, new Error("snapshot pending")],
      error,
    );
    await f.run();
    assert.deepEqual(f.order, ["refresh", "interrupt-all", "stop"]);
    assert.equal(f.result().archived, false);
  }
});

test("archived and rejected stop claims perform no interruption", async () => {
  const archived = fixture({ sandboxId: "synthetic" }, [{ state: "archived" }]);
  await archived.run();
  assert.deepEqual(archived.order, ["refresh"]);
  const rejected = fixture({ sandboxId: "synthetic" });
  rejected.ctx.runMutation = async () => false;
  await rejected.run();
  assert.deepEqual(rejected.order, []);
});
