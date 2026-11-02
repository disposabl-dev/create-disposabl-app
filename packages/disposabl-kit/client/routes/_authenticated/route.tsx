import {
  createFileRoute,
  Navigate,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { useState } from "react";
import { authenticationEnabled } from "../../../features";
import { Spinner } from "../../components/ui/spinner";

export const Route = createFileRoute("/_providers/_authenticated")({
  ssr: false,
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: AuthenticatedLayout,
});

export function AuthenticatedLayout({
  enabled = authenticationEnabled,
}: { enabled?: boolean } = {}) {
  if (!enabled) return <Outlet />;
  return (
    <>
      <Authenticated>
        <Outlet />
      </Authenticated>
      <Unauthenticated>
        <SignInRedirect />
      </Unauthenticated>
      <AuthLoading>
        <Spinner className="h-10 w-10 animate-spin" />
      </AuthLoading>
    </>
  );
}

function SignInRedirect() {
  const href = useRouterState({
    select: (state) => state.location.href,
  });
  // Keep the destination stable while navigating away from the protected route.
  const [returnTo] = useState(href);
  return <Navigate to="/login" search={{ returnTo }} />;
}
