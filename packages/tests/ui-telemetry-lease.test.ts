import { test } from "node:test";
import assert from "node:assert/strict";
import { createTelemetryLeaseController } from "../disposabl-kit/client/lib/telemetry-lease";

const id = "00000000-0000-4000-8000-000000000001";
const token = (session: string) =>
  `x.${btoa(JSON.stringify({ sub: session }))}.x`;
const reply = (extra = {}) =>
  new Response(
    JSON.stringify({
      enabled: true,
      projectToken: "public-test",
      host: "https://us.i.posthog.com",
      anonymousId: id,
      distinctId: "server-id",
      identified: false,
      expiresAt: Date.now() + 30_000,
      ...extra,
    }),
    { status: 200 },
  );
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

test("disabled emits nothing; opt-out stops an active adapter synchronously", async () => {
  let calls = 0;
  const events: string[] = [];
  const control = createTelemetryLeaseController({
    origin: "http://local",
    transport: async () => {
      calls++;
      return reply();
    },
    adapter: {
      start: () => events.push("start"),
      stop: () => events.push("stop"),
    },
  });
  control.update({ enabled: false, token: null });
  await tick();
  assert.equal(calls, 0);
  control.update({ enabled: true, token: null });
  await tick();
  control.update({ enabled: false, token: null });
  assert.deepEqual(events, ["start", "stop"]);
  control.stop();
});

test("account change invalidates an unresolved response and never starts its identity", async () => {
  let resolve!: (response: Response) => void;
  const events: string[] = [];
  const control = createTelemetryLeaseController({
    origin: "http://local",
    transport: () =>
      new Promise((done) => {
        resolve = done;
      }),
    adapter: {
      start: (lease) => events.push(lease.distinctId),
      stop: () => events.push("stop"),
    },
  });
  control.update({ enabled: true, token: token("old") });
  control.update({ enabled: false, token: token("new") });
  resolve(reply({ identified: true }));
  await tick();
  assert.deepEqual(events, []);
  control.stop();
});

test("anonymous identity is forwarded for login but never reused across logout", async () => {
  const bodies: string[] = [];
  const control = createTelemetryLeaseController({
    origin: "http://local",
    transport: async (_url, init) => {
      bodies.push(String(init?.body));
      return reply();
    },
    adapter: { start() {}, stop() {} },
  });
  control.update({ enabled: true, token: null });
  await tick();
  control.update({ enabled: true, token: token("signed-in") });
  await tick();
  control.update({ enabled: true, token: null });
  await tick();
  assert.deepEqual(
    bodies.map((body) => JSON.parse(body)),
    [{}, { anonymousId: id }, {}],
  );
  control.stop();
});

test("disabled, malformed and unapproved bootstrap replies never start SDK", async () => {
  for (const response of [
    new Response(null, { status: 204 }),
    reply({ host: "https://example.org" }),
    reply({ expiresAt: Date.now() + 1_000 }),
    reply({ identified: true }),
  ]) {
    let started = false;
    const control = createTelemetryLeaseController({
      origin: "http://local",
      transport: async () => response,
      adapter: {
        start: () => {
          started = true;
        },
        stop() {},
      },
    });
    control.update({ enabled: true, token: null });
    await tick();
    assert.equal(started, false);
    control.stop();
  }
});

test("access token refresh for the same session retains anonymous linkage", async () => {
  const bodies: string[] = [];
  const control = createTelemetryLeaseController({
    origin: "http://local",
    transport: async (_url, init) => {
      bodies.push(String(init?.body));
      return reply({ identified: true });
    },
    adapter: { start() {}, stop() {} },
  });
  control.update({ enabled: true, token: token("same") + "a" });
  await tick();
  control.update({ enabled: true, token: token("same") + "b" });
  await tick();
  assert.deepEqual(
    bodies.map((body) => JSON.parse(body)),
    [{}, { anonymousId: id }],
  );
  control.stop();
});

test("failed refresh stops capture and cannot revive an expired lease", async () => {
  let calls = 0;
  const events: string[] = [];
  const control = createTelemetryLeaseController({
    origin: "http://local",
    transport: async () => {
      calls++;
      return calls === 1
        ? reply({ expiresAt: Date.now() + 5_100 })
        : new Response(null, { status: 401 });
    },
    adapter: {
      start: () => events.push("start"),
      stop: () => events.push("stop"),
    },
  });
  control.update({ enabled: true, token: null });
  await new Promise<void>((resolve) => setTimeout(resolve, 250));
  assert.equal(calls, 2);
  assert.deepEqual(events, ["start", "stop"]);
  control.stop();
});

test(
  "lease expiry stops capture while refresh hangs and ignores a late reply",
  { timeout: 10_000 },
  async () => {
    let calls = 0;
    let finish!: (response: Response) => void;
    const events: string[] = [];
    const control = createTelemetryLeaseController({
      origin: "http://local",
      transport: async () => {
        calls++;
        return calls === 1
          ? reply({ expiresAt: Date.now() + 5_100 })
          : new Promise<Response>((resolve) => {
              finish = resolve;
            });
      },
      adapter: {
        start: () => events.push("start"),
        stop: () => events.push("stop"),
      },
    });
    control.update({ enabled: true, token: null });
    await new Promise<void>((resolve) => setTimeout(resolve, 5_250));
    assert.equal(calls, 2);
    assert.deepEqual(events, ["start", "stop"]);
    finish(reply());
    await tick();
    assert.deepEqual(events, ["start", "stop"]);
    control.stop();
  },
);

test("periodic and same-session refresh renew the adapter without resetting its session", async () => {
  const events: string[] = [];
  let calls = 0;
  const control = createTelemetryLeaseController({
    origin: "http://local",
    transport: async () => {
      calls++;
      return reply({
        identified: true,
        expiresAt: Date.now() + (calls === 1 ? 5_100 : 30_000),
      });
    },
    adapter: {
      start: () => events.push("start"),
      renew: () => events.push("renew"),
      stop: () => events.push("stop"),
    },
  });
  control.update({ enabled: true, token: token("same") + "a" });
  await new Promise<void>((resolve) => setTimeout(resolve, 250));
  assert.deepEqual(events, ["start", "renew"]);
  control.update({ enabled: true, token: token("same") + "b" });
  await tick();
  assert.deepEqual(events, ["start", "renew", "renew"]);
  control.update({ enabled: true, token: token("other") });
  assert.equal(events.at(-1), "stop");
  await tick();
  assert.equal(events.at(-1), "start");
  control.stop();
});

test("a changed server identity restarts even during a same-session refresh", async () => {
  let calls = 0;
  const events: string[] = [];
  const control = createTelemetryLeaseController({
    origin: "http://local",
    transport: async () =>
      reply({ identified: true, distinctId: `identity-${++calls}` }),
    adapter: {
      start: (lease) => events.push(lease.distinctId),
      renew: () => events.push("renew"),
      stop: () => events.push("stop"),
    },
  });
  control.update({ enabled: true, token: token("same") + "a" });
  await tick();
  control.update({ enabled: true, token: token("same") + "b" });
  await tick();
  assert.deepEqual(events, ["identity-1", "stop", "identity-2"]);
  control.stop();
});

test("transient bootstrap failure retries with capture off until a valid lease", async () => {
  let calls = 0;
  const events: string[] = [];
  const control = createTelemetryLeaseController({
    origin: "http://local",
    transport: async () =>
      ++calls === 1 ? new Response(null, { status: 429 }) : reply(),
    adapter: {
      start: () => events.push("start"),
      stop: () => events.push("stop"),
    },
  });
  control.update({ enabled: true, token: null });
  await tick();
  assert.deepEqual(events, []);
  await new Promise<void>((resolve) => setTimeout(resolve, 1_100));
  assert.equal(calls, 2);
  assert.deepEqual(events, ["start"]);
  control.stop();
});

test("opt-out cancels pending retry after a transport failure", async () => {
  let calls = 0;
  const events: string[] = [];
  const control = createTelemetryLeaseController({
    origin: "http://local",
    transport: async () => {
      calls++;
      throw new Error("offline");
    },
    adapter: {
      start: () => events.push("start"),
      stop: () => events.push("stop"),
    },
  });
  control.update({ enabled: true, token: null });
  await tick();
  control.update({ enabled: false, token: null });
  await new Promise<void>((resolve) => setTimeout(resolve, 1_100));
  assert.equal(calls, 1);
  assert.deepEqual(events, []);
});

test("a failed renewal stops the SDK and recovers only after fresh authorization", async () => {
  let calls = 0;
  const events: string[] = [];
  const control = createTelemetryLeaseController({
    origin: "http://local",
    transport: async () => {
      calls++;
      return calls === 2
        ? new Response(null, { status: 503 })
        : reply({ expiresAt: Date.now() + (calls === 1 ? 5_100 : 30_000) });
    },
    adapter: {
      start: () => events.push("start"),
      stop: () => events.push("stop"),
    },
  });
  control.update({ enabled: true, token: null });
  await new Promise<void>((resolve) => setTimeout(resolve, 250));
  assert.deepEqual(events, ["start", "stop"]);
  await new Promise<void>((resolve) => setTimeout(resolve, 1_100));
  assert.equal(calls, 3);
  assert.deepEqual(events, ["start", "stop", "start"]);
  control.stop();
});

test("a successful response with a failed network body retries but malformed JSON does not", async () => {
  for (const failure of [
    new TypeError("connection lost"),
    new SyntaxError("invalid JSON"),
  ]) {
    let calls = 0;
    let starts = 0;
    const control = createTelemetryLeaseController({
      origin: "http://local",
      transport: async () => {
        if (++calls !== 1) return reply();
        const response = new Response("", { status: 200 });
        response.json = async () => {
          throw failure;
        };
        return response;
      },
      adapter: {
        start: () => {
          starts++;
        },
        stop() {},
      },
    });
    control.update({ enabled: true, token: null });
    await new Promise<void>((resolve) => setTimeout(resolve, 1_100));
    const recoverable = failure instanceof TypeError;
    assert.equal(calls, recoverable ? 2 : 1);
    assert.equal(starts, recoverable ? 1 : 0);
    control.stop();
  }
});
