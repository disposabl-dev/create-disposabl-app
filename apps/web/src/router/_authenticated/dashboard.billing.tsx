import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAction, usePaginatedQuery, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../../../../packages/backend/convex/_generated/api";
import { Button } from "@disposabl/disposabl-kit/client/components/ui/button";

export const Route = createFileRoute(
  "/_providers/_authenticated/dashboard/billing",
)({
  validateSearch: (search: Record<string, unknown>) => ({
    appId: typeof search.appId === "string" ? search.appId : undefined,
  }),
  component: AppBilling,
});

function AppBilling() {
  const { appId } = Route.useSearch();
  const apps = usePaginatedQuery(
    api.apps.index.list,
    {},
    { initialNumItems: 30 },
  );
  const begin = useAction(api.apps.index.beginStripe);
  const enable = useAction(api.apps.index.enableLivePayments);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const selected = useQuery(api.apps.index.get, appId ? { appId } : "skip");
  const billableApps = apps.results.filter((app) =>
    app.features?.includes("payments"),
  );

  async function activate(connect: boolean) {
    if (!appId || busy) return;
    setBusy(true);
    setMessage("");
    try {
      if (connect) {
        const url = await begin({ appId });
        window.location.assign(url);
      } else {
        await enable({ appId });
        setMessage("Live payments are ready.");
      }
    } catch (error) {
      setMessage(
        error instanceof ConvexError && typeof error.data === "string"
          ? error.data
          : "Could not set up payments. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">App billing</h1>
      {appId && (
        <Link
          to="/dashboard/billing"
          search={{ appId: undefined }}
          className="underline"
        >
          All apps
        </Link>
      )}
      {appId && selected === undefined ? (
        <p role="status">Loading app…</p>
      ) : appId && !selected?.features?.includes("payments") ? (
        <p>This app is unavailable for live payments.</p>
      ) : appId ? (
        <>
          <p>{selected?.name}</p>
          <p>Connect Stripe to accept live payments.</p>
          <div className="flex flex-wrap gap-3">
            <Button disabled={busy} onClick={() => void activate(true)}>
              Connect Stripe
            </Button>
            <Button
              disabled={busy}
              variant="outline"
              onClick={() => void activate(false)}
            >
              Finish setup
            </Button>
          </div>
          {message && <p role="status">{message}</p>}
        </>
      ) : (
        <>
          {apps.status === "LoadingFirstPage" && (
            <p role="status">Loading apps…</p>
          )}
          {apps.status === "Exhausted" && billableApps.length === 0 && (
            <p>No apps with payments enabled.</p>
          )}
          {billableApps.length > 0 && (
            <>
              <p>Choose an app to set up live payments.</p>
              <ul className="space-y-3">
                {billableApps.map((app) => (
                  <li key={app.appId}>
                    <Link
                      className="underline"
                      to="/dashboard/billing"
                      search={{ appId: app.appId }}
                    >
                      {app.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          {apps.status === "CanLoadMore" && (
            <Button variant="outline" onClick={() => apps.loadMore(30)}>
              Load more
            </Button>
          )}
        </>
      )}
    </main>
  );
}
