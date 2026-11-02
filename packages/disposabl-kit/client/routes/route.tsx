import { useState } from "react";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { authenticationEnabled } from "../../features";
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
    <AuthProvider client={client} enabled={authenticationEnabled}>
      <Outlet />
    </AuthProvider>
  );
}

export function AuthProvider({
  client,
  enabled,
  children,
}: {
  client: ConvexReactClient;
  enabled: boolean;
  children: React.ReactNode;
}) {
  if (!enabled) {
    return <ConvexProvider client={client}>{children}</ConvexProvider>;
  }

  return (
    <ConvexAuthProvider
      client={client}
      api={{
        refreshSession: api.auth.refreshSession,
        signOut: api.auth.signOut,
      }}
    >
      {children}
    </ConvexAuthProvider>
  );
}
