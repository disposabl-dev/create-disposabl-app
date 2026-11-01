import { useState } from "react";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { api } from "../../../backend/convex/_generated/api";

export const Route = createFileRoute("/_providers")({
  component: Providers,
});

function Providers() {
  const [client] = useState(() => {
    const url = import.meta.env.VITE_CONVEX_URL;
    if (!url)
      throw new Error("Set VITE_CONVEX_URL to your Convex deployment URL");
    return new ConvexReactClient(url);
  });

  return (
    <ConvexAuthProvider
      client={client}
      api={{
        refreshSession: api.auth.refreshSession,
        signOut: api.auth.signOut,
      }}
    >
      <Outlet />
    </ConvexAuthProvider>
  );
}
