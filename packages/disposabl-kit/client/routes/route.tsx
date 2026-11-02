import { useState } from "react";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexProvider, ConvexReactClient, useConvexAuth } from "convex/react";
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
      <SiteHeader />
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

function SiteHeader() {
  return (
    <header className="border-b border-neutral-200">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4" aria-label="Main navigation">
        <a href="/" aria-label="Disposabl home"><img src="/disposabl-logo.svg" alt="Disposabl" className="h-9 w-auto" /></a>
        {authenticationEnabled && <AuthLinks />}
      </nav>
    </header>
  );
}

function AuthLinks() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (isLoading) return null;
  return isAuthenticated ? (
    <a href="/dashboard">Dashboard</a>
  ) : (
    <div className="flex items-center gap-5"><a href="/login">Login</a><a href="/signup">Sign up</a></div>
  );
}
