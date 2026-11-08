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
