import { describe, expect, test } from "bun:test";
import { Outlet } from "@tanstack/react-router";
import { Authenticated, type ConvexReactClient } from "convex/react";
import { AuthProvider } from "../../../packages/disposabl-kit/client/routes/route";
import { AuthenticatedLayout } from "../../../packages/disposabl-kit/client/routes/_authenticated/route";
import { createRoutes } from "../../../packages/disposabl-kit/client/vite.config";

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

  test("registers auth routes only when authentication is enabled", () => {
    const paths = (enabled: boolean) => {
      const config = createRoutes(enabled);
      const providers = config.children?.[0];
      if (!providers || !("children" in providers))
        throw new Error("Missing providers layout");
      return (
        providers.children?.flatMap((child) =>
          "path" in child ? [child.path] : [],
        ) ?? []
      );
    };
    expect(paths(true)).toEqual(
      expect.arrayContaining(["/login", "/signup", "/consent"]),
    );
    expect(paths(false)).not.toContain("/login");
    expect(paths(false)).not.toContain("/signup");
    expect(paths(false)).not.toContain("/consent");
  });
});
