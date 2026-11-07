import { Logo } from "../components/logo";
import { LegalFooter } from "../components/legal-page";
import { LogOut } from "../components/ui/log-out";
import { useState } from "react";
import { ThemeProvider } from "../lib/theme";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import {
  ConvexProvider,
  ConvexReactClient,
  useConvexAuth,
  useQuery,
} from "convex/react";
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
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <AuthProvider client={client} enabled={authenticationEnabled}>
        <SiteHeader />
        <Outlet />
        <LegalFooter />
      </AuthProvider>
    </ThemeProvider>
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
      <nav
        className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4"
        aria-label="Main navigation"
      >
        <a href="/" aria-label="Disposabl home">
          <Logo />
        </a>
        {authenticationEnabled && <AuthLinks />}
      </nav>
    </header>
  );
}

function AuthLinks() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const providers = useQuery(api.auth.providers);
  if (isLoading) return null;
  return isAuthenticated ? (
    <div className="flex items-center gap-5">
      <a href="/dashboard">Dashboard</a>
      {providers && !providers.googleOnly && (
        <a href="/change-password">Change password</a>
      )}
      <LogOut />
    </div>
  ) : (
    <div className="flex items-center gap-5">
      <a href="/login">Login</a>
      <a href="/signup">Sign up</a>
    </div>
  );
}
