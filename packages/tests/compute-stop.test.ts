import { test } from "node:test";
import assert from "node:assert/strict";
import { getFunctionName } from "convex/server";
import { stop } from "../backend/convex/agent/actions/compute";

function fixture(record: unknown, results: Array<unknown> = []) {
  const calls: { name: string; args: any }[] = [];
  let actions = 0;
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
      const result = results[actions++];
      if (result instanceof Error) throw result;
      if (!result) throw new Error("Unexpected provider action");
      return result;
    },
  };
  return {
    ctx,
    calls,
    actions: () => actions,
    result: () =>
      calls.find((call) => call.name === "agent/compute:stopped")?.args,
  };
}

test("missing Boat record or sandbox ID cannot confirm a stop", async () => {
  for (const record of [null, { state: "archived" }, { sandboxId: "" }]) {
    const f = fixture(record);
    await (stop as any)._handler(f.ctx, { sessionId: "session" });
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
    await (stop as any)._handler(f.ctx, { sessionId: "session" });
    assert.equal(f.result()?.archived, expected);
  }
});
