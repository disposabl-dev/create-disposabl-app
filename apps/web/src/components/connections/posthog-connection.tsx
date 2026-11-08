import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../../../../packages/backend/convex/_generated/api";
import { Button } from "@disposabl/disposabl-kit/client/components/ui/button";
import { ProviderLogo } from "./provider-logo";

export function PosthogConnection({
  connected,
  pending,
  required,
  available,
  busy,
  connect,
  disconnect,
}: {
  connected: { name: string } | null;
  pending: boolean;
  required: boolean;
  available: boolean;
  busy: boolean;
  connect: (region: "us" | "eu") => void;
  disconnect: () => void;
}) {
  const list = useAction(api.connections.index.posthogAccounts);
  const select = useAction(api.connections.index.selectPosthog);
  const [region, setRegion] = useState<"us" | "eu">("us");
  const [accounts, setAccounts] =
    useState<Array<{ id: string; name: string }>>();
  const [error, setError] = useState<string>();
  const [selecting, setSelecting] = useState(false);
  const [attempt, retry] = useState(0);

  useEffect(() => {
    if (!pending) {
      setSelecting(false);
      return;
    }
    let cancelled = false;
    setSelecting(true);
    setError(undefined);
    void list({})
      .then(async (result) => {
        if (cancelled) return;
        setAccounts(result);
        const only = result.at(0);
        if (result.length === 1 && only) await select({ accountId: only.id });
      })
      .catch((cause) => {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load your PostHog organizations. Connect again.",
          );
      })
      .finally(() => {
        if (!cancelled) setSelecting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pending, list, select, attempt]);

  return (
    <section
      className={`rounded-2xl border bg-card p-5 shadow-sm sm:p-6 ${!required && !connected && !pending ? "opacity-80 hover:opacity-100 focus-within:opacity-100" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-4 sm:flex-nowrap">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border bg-background">
          <ProviderLogo provider="posthog" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">PostHog</h2>
            <span className="text-xs text-muted-foreground">
              {connected
                ? "Connected"
                : required
                  ? "Required for Analytics"
                  : "Optional"}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {connected
              ? connected.name
              : "Create analytics projects in your PostHog organization."}
          </p>
        </div>
        {connected ? (
          <Button
            variant="outline"
            disabled={busy || selecting}
            onClick={disconnect}
          >
            Disconnect
          </Button>
        ) : (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {available && (
              <select
                aria-label="PostHog region"
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={region}
                disabled={busy || selecting}
                onChange={(event) =>
                  setRegion(event.target.value as "us" | "eu")
                }
              >
                <option value="us">US Cloud</option>
                <option value="eu">EU Cloud</option>
              </select>
            )}
            <Button
              disabled={busy || selecting || !available}
              onClick={() => connect(region)}
            >
              {pending ? "Connect again" : "Connect"}
            </Button>
          </div>
        )}
      </div>
      {!available && !connected && (
        <p className="mt-4 text-sm text-muted-foreground">
          Temporarily unavailable.
        </p>
      )}
      {pending && (
        <div className="mt-4 space-y-3 border-t pt-4">
          <p className="text-sm">
            {selecting
              ? "Loading your PostHog organizations…"
              : accounts?.length === 0
                ? "No organizations were available. Connect again and grant organization access, or create an organization in PostHog."
                : "Choose the organization for your apps. Your terminal will continue after it is saved."}
          </p>
          {accounts?.map((account) => (
            <Button
              key={account.id}
              variant="outline"
              className="mr-2"
              disabled={busy || selecting}
              onClick={() => {
                setSelecting(true);
                setError(undefined);
                void select({ accountId: account.id })
                  .catch((cause) =>
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "Could not select this organization.",
                    ),
                  )
                  .finally(() => setSelecting(false));
              }}
            >
              {account.name}
            </Button>
          ))}
          {error && (
            <>
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
              <Button
                variant="outline"
                disabled={busy || selecting}
                onClick={() => retry((value) => value + 1)}
              >
                Retry
              </Button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
