import { describe, expect, test } from "bun:test";
import { Outlet } from "@tanstack/react-router";
import { Authenticated, type ConvexReactClient } from "convex/react";
import { AuthProvider } from "../../../packages/disposabl-kit/client/routes/route";
import { AuthenticatedLayout } from "../../../packages/disposabl-kit/client/routes/_authenticated/route";
import { ConsentPage } from "../../../packages/disposabl-kit/client/routes/consent";
import { Todos } from "../src/router/_authenticated/todos/index";
import { Todo } from "../src/router/_authenticated/todos/$id";
import { renderToStaticMarkup } from "react-dom/server";

describe("frontend authentication branches", () => {
  test("selects the correct Convex provider", () => {
    const client = {} as ConvexReactClient;
    expect(
      AuthProvider({ client, enabled: true, children: null }).type.name,
    ).toBe("ConvexAuthProvider");
    expect(
      AuthProvider({ client, enabled: false, children: null }).type.name,
    ).toBe("ConvexProvider");
  });

  test("gates authenticated routes only when enabled", () => {
    expect(AuthenticatedLayout({ enabled: false }).type).toBe(Outlet);
    const enabled = AuthenticatedLayout({ enabled: true });
    expect(enabled.props.children[0].type).toBe(Authenticated);
  });

  test("disabled private demos and consent show a message without auth hooks or queries", () => {
    for (const element of [
      ConsentPage({ enabled: false }),
      Todos({ enabled: false }),
      Todo({ enabled: false }),
    ]) {
      expect(renderToStaticMarkup(element)).toContain("authentication");
    }
  });
});
