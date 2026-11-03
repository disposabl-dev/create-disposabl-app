import { useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { api } from "../../../backend/convex/_generated/api";
import { Button } from "../components/ui/button";

export const Route = createFileRoute("/_providers/consent")({
  validateSearch: (search: Record<string, unknown>): { request?: string } => ({
    request:
      typeof search.request === "string"
        ? search.request.trim() || undefined
        : undefined,
  }),
  component: ConsentPage,
});

export function ConsentPage() {
  const { request: requestId } = Route.useSearch();
  const request = useQuery(
    api.mcp.getAuthRequest,
    requestId ? { requestId } : "skip",
  );
  const authorize = useAction(api.mcp.authorize);
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = async (approve: boolean) => {
    if (!requestId || pending) return;
    setPending(true);
    setError(null);
    try {
      const { redirectUrl } = await authorize({ requestId, approve });
      if (redirectUrl) window.location.assign(redirectUrl);
      else setPending(false);
    } catch {
      setError("Could not save your decision. Please try again.");
      setPending(false);
    }
  };

  let content;
  if (!requestId) {
    content = (
      <p>
        No connection request was provided. Start the connection from your
        agent.
      </p>
    );
  } else if (request === undefined || isLoading) {
    content = <p role="status">Loading connection request…</p>;
  } else if (request === null) {
    content = (
      <p>
        This request has expired or could not be found. Start again from your
        agent.
      </p>
    );
  } else if (request.status !== "pending" && !pending) {
    content = (
      <p>
        This request has already been {request.status}. Return to your agent to
        continue.
      </p>
    );
  } else {
    content = (
      <>
        <p>
          <strong>{request.clientName || request.clientId}</strong> wants to
          connect to {request.serverName}.
        </p>
        <section className="space-y-2" aria-label="Requested permissions">
          <h2 className="font-medium">Requested access</h2>
          {request.scopes.length ? (
            <ul className="list-disc space-y-2 pl-5">
              {request.scopes.map((scope) => (
                <li key={scope.name}>{scope.description || scope.name}</li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">
              No additional scopes requested.
            </p>
          )}
        </section>
        <div className="space-y-1 text-sm">
          <p className="font-medium">Return address</p>
          <p className="break-all text-muted-foreground">
            {request.redirectUri}
          </p>
        </div>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        {isAuthenticated ? (
          <div className="flex gap-3">
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => decide(false)}
            >
              Deny
            </Button>
            <Button disabled={pending} onClick={() => decide(true)}>
              Allow
            </Button>
            {pending && (
              <span
                role="status"
                className="self-center text-sm text-muted-foreground"
              >
                Saving…
              </span>
            )}
          </div>
        ) : (
          <Navigate to="/signup" search={{ request: requestId }} replace />
        )}
      </>
    );
  }

  return (
    <main className="mx-auto w-full max-w-lg space-y-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">Connect your agent</h1>
      {content}
    </main>
  );
}
