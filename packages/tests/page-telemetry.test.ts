import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createPageTelemetry,
  pageCategory,
} from "../disposabl-kit/lib/telemetry";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const token = (session: string, extra = "") =>
  `x.${btoa(JSON.stringify({ sub: session, extra }))}.x`;
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
async function until(check: () => boolean) {
  for (let n = 0; n < 100 && !check(); n++) await tick();
  assert.ok(check(), "telemetry did not settle");
}

test("persisted anonymous history links on login and rotates on logout or account switch", async () => {
  let saved: string | null = null;
  let next = 0;
  const bodies: any[] = [];
  const storage = {
    getItem: () => saved,
    setItem: (_: string, value: string) => {
      saved = value;
    },
  };
  const transport = (async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    bodies.push(body);
    return Response.json({ anonymousId: body.anonymousId ?? id(++next) });
  }) as typeof fetch;
  let telemetry = createPageTelemetry(storage, transport);
  const send = async (session: string | null, path = "/") => {
    const count = bodies.length;
    telemetry.view("https://backend.example", "web", path, session);
    await until(
      () =>
        bodies.length > count &&
        !!saved &&
        JSON.parse(saved).anonymousId !== null,
    );
  };
  await send(null, "/private?secret=foo");
  assert.deepEqual(bodies[0], { platform: "web", page: "other" });
  telemetry = createPageTelemetry(storage, transport); // browser restart
  await send(token("a"), "/login");
  assert.equal(bodies[1].anonymousId, id(1));
  await send(token("a", "refreshed"));
  assert.equal(bodies[2].anonymousId, id(1));
  await send(token("b"));
  assert.equal(bodies[3].anonymousId, undefined);
  await send(null);
  assert.equal(bodies[4].anonymousId, undefined);
  await send(token("c"));
  assert.equal(bodies[5].anonymousId, id(3));
  assert.equal(pageCategory("/dashboard/connections?secret=x"), "connections");
});

test("in-flight account changes discard old IDs and keep at most one pending view", async () => {
  let saved: string | null = null;
  const bodies: any[] = [];
  let release!: (response: Response) => void;
  const storage = {
    getItem: () => saved,
    setItem: (_: string, value: string) => {
      saved = value;
    },
  };
  const transport = (async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    bodies.push(body);
    if (bodies.length === 1)
      return await new Promise<Response>((resolve) => {
        release = resolve;
      });
    return Response.json({ anonymousId: body.anonymousId ?? id(2) });
  }) as typeof fetch;
  const telemetry = createPageTelemetry(storage, transport);
  telemetry.view("https://backend.example", "mobile", "/", token("a"));
  await until(() => bodies.length === 1);
  telemetry.view("https://backend.example", "mobile", "/", null);
  telemetry.view("https://backend.example", "mobile", "/account", token("b"));
  release(Response.json({ anonymousId: id(1) }));
  await until(() => bodies.length === 2);
  assert.equal(bodies[1].anonymousId, undefined);
  assert.equal(bodies[1].page, "account");
});

function sharedTabs() {
  let saved: string | null = null;
  let lock = Promise.resolve();
  let sequence = 0;
  const bodies: any[] = [];
  const storage = {
    getItem: () => saved,
    setItem: (_: string, value: string) => {
      saved = value;
    },
  };
  const exclusive = (work: () => Promise<void>) => {
    const next = lock.then(work);
    lock = next.catch(() => {});
    return next;
  };
  let release: (() => void) | undefined;
  let hold = false;
  const transport = (async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    bodies.push(body);
    const assigned = body.anonymousId ?? id(++sequence);
    if (hold) {
      hold = false;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    }
    return Response.json({ anonymousId: assigned });
  }) as typeof fetch;
  return {
    bodies,
    storage,
    exclusive,
    transport,
    state: () => saved && JSON.parse(saved),
    hold: () => {
      hold = true;
    },
    release: () => release?.(),
    idle: async () => {
      await tick();
      await lock;
    },
  };
}

test("concurrent browser initialization and account changes do not merge different accounts", async () => {
  const shared = sharedTabs();
  const a = createPageTelemetry(
    shared.storage,
    shared.transport,
    shared.exclusive,
  );
  const b = createPageTelemetry(
    shared.storage,
    shared.transport,
    shared.exclusive,
  );
  shared.hold();
  a.view("https://backend.example", "web", "/", null);
  await until(() => shared.bodies.length === 1);
  b.view("https://backend.example", "web", "/", null);
  await tick();
  assert.equal(shared.bodies.length, 1);
  shared.release();
  await shared.idle();
  assert.equal(shared.bodies[0].anonymousId, undefined);
  assert.equal(shared.bodies[1].anonymousId, id(1));
  a.view("https://backend.example", "web", "/login", token("a"));
  await shared.idle();
  assert.equal(shared.bodies[2].anonymousId, id(1));
  b.view("https://backend.example", "web", "/login", token("b"));
  await shared.idle();
  assert.equal(shared.bodies[3].anonymousId, undefined);
  assert.equal(shared.state()?.session, "b");
  assert.equal(shared.state()?.anonymousId, id(2));
});

test("logout waits for another tab's response before rotating shared identity", async () => {
  const shared = sharedTabs();
  const a = createPageTelemetry(
    shared.storage,
    shared.transport,
    shared.exclusive,
  );
  const b = createPageTelemetry(
    shared.storage,
    shared.transport,
    shared.exclusive,
  );
  a.view("https://backend.example", "web", "/", token("a"));
  await shared.idle();
  shared.hold();
  b.view("https://backend.example", "web", "/account", token("a"));
  await until(() => shared.bodies.length === 2);
  a.view("https://backend.example", "web", "/", null);
  await tick();
  assert.equal(shared.bodies.length, 2);
  shared.release();
  await shared.idle();
  assert.equal(shared.bodies[2].anonymousId, undefined);
  assert.equal(shared.state()?.session, null);
  assert.equal(shared.state()?.anonymousId, id(2));
  b.view("https://backend.example", "web", "/login", token("b"));
  await shared.idle();
  // This tab did not observe logout, so it conservatively rotates again.
  assert.equal(shared.bodies[3].anonymousId, undefined);
  assert.equal(shared.state()?.session, "b");
});

test("a failed storage write cannot link an identity that other tabs still see", async () => {
  let calls = 0;
  const existing = JSON.stringify({ anonymousId: id(1), session: null });
  const storage = {
    getItem: () => existing,
    setItem: () => {
      throw new Error("storage unavailable");
    },
  };
  const transport = (async () => {
    calls++;
    return Response.json({ anonymousId: id(1) });
  }) as typeof fetch;
  const telemetry = createPageTelemetry(storage, transport);
  telemetry.view("https://backend.example", "web", "/login", token("a"));
  await tick();
  assert.equal(calls, 0);
});
