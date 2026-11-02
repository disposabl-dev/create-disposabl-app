import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
} from "@tanstack/react-router";
import config from "../../../../../disposabl.json";
import { authenticationEnabled } from "@disposabl/disposabl-kit/features";
import { LogOut } from "@disposabl/disposabl-kit/client/components/ui/log-out";

export const Route = createFileRoute("/_providers/_authenticated/dashboard")({
  component: Dashboard,
});
function Dashboard() {
  const pathname = useLocation({ select: (location) => location.pathname });
  if (pathname !== "/dashboard" && pathname !== "/dashboard/")
    return <Outlet />;
  return (
    <main className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <nav className="flex gap-4">
        <Link to="/todos">Todos</Link>
        {authenticationEnabled && config.platforms.includes("api") && (
          <Link to="/dashboard/api-keys">API keys</Link>
        )}
      </nav>
      {authenticationEnabled && <LogOut />}
    </main>
  );
}
