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
  const pathname = useLocation({ select: (location) => location.pathname });
  if (pathname !== "/dashboard" && pathname !== "/dashboard/")
    return <Outlet />;
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <nav className="flex gap-4 pt-4 text-sm">
        {config.platforms.includes("api") && (
          <Link to="/dashboard/api-keys">API keys</Link>
        )}
      </nav>
    </main>
  );
}
