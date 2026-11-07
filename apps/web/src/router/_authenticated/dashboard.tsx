import { useAuthToken } from "@convex-dev/auth/react";
import { useEffect, useState } from "react";
import { Connections } from "./dashboard.connections";
import {
  connectionsSeen,
  sessionId,
} from "../../components/connections/flow-state";
import { AgentOnboarding } from "../../components/agent-onboarding";
import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
} from "@tanstack/react-router";
import config from "../../../../../disposabl.json";

export const Route = createFileRoute("/_providers/_authenticated/dashboard")({
  component: Dashboard,
});
function Dashboard() {
  const token = useAuthToken();
  const session = sessionId(token);
  const [seenSession, setSeenSession] = useState<string | null>(null);
  const pathname = useLocation({ select: (location) => location.pathname });
  const isDashboard = pathname === "/dashboard" || pathname === "/dashboard/";
  useEffect(() => {
    if (!isDashboard) return;
    setSeenSession(connectionsSeen(sessionStorage, session) ? session : null);
  }, [session, isDashboard]);
  if (pathname !== "/dashboard" && pathname !== "/dashboard/")
    return <Outlet />;
  if (!session || seenSession !== session)
    return <Connections onContinue={() => setSeenSession(session)} />;
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <AgentOnboarding />
      <nav className="flex gap-4 pt-4 text-sm">
        <Link to="/dashboard/connections">Connections</Link>
        {config.platforms.includes("api") && (
          <Link to="/dashboard/api-keys">API keys</Link>
        )}
      </nav>
    </main>
  );
}
