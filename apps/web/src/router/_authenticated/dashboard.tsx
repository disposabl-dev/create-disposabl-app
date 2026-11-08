import { useAuthToken } from "@convex-dev/auth/react";
import { useEffect, useState } from "react";
import { Connections } from "./dashboard.connections";
import {
  connectionsSeen,
  paymentSeen,
  completePayment,
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
import { Pricing } from "../../../../../packages/disposabl-kit/client/routes/pricing";
import { Button } from "@disposabl/disposabl-kit/client/components/ui/button";

export const Route = createFileRoute("/_providers/_authenticated/dashboard")({
  component: Dashboard,
});
function Dashboard() {
  const token = useAuthToken();
  const session = sessionId(token);
  const [seenSession, setSeenSession] = useState<string | null>(null);
  const [paymentSession, setPaymentSession] = useState<string | null>(null);
  const pathname = useLocation({ select: (location) => location.pathname });
  const isDashboard = pathname === "/dashboard" || pathname === "/dashboard/";
  useEffect(() => {
    if (!isDashboard) return;
    setSeenSession(connectionsSeen(sessionStorage, session) ? session : null);
    setPaymentSession(paymentSeen(sessionStorage, session) ? session : null);
  }, [session, isDashboard]);
  if (pathname !== "/dashboard" && pathname !== "/dashboard/")
    return <Outlet />;
  if (!session || seenSession !== session)
    return <Connections onContinue={() => setSeenSession(session)} />;
  if (paymentSession !== session)
    return (
      <main className="mx-auto max-w-3xl space-y-6 px-6 py-12">
        <p>Payment is optional. Local mode is free.</p>
        <Pricing />
        <Button
          onClick={() => {
            completePayment(sessionStorage, session);
            setPaymentSession(session);
          }}
        >
          Continue locally
        </Button>
        <Link className="ml-4 text-sm underline" to="/pricing">
          View all plans
        </Link>
      </main>
    );
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
