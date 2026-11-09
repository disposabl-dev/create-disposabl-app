import { test } from "node:test";
import assert from "node:assert/strict";
import { createTelemetryLeaseController } from "../disposabl-kit/client/lib/telemetry-lease";

const id = "00000000-0000-4000-8000-000000000001";
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
  control.update({ enabled: true, token: "old" });
  control.update({ enabled: false, token: "new" });
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
  control.update({ enabled: true, token: "signed-in" });
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
