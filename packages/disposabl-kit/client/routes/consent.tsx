import { useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { api } from "../../../backend/convex/_generated/api";
import { useConsentIdentity } from "../components/consent-identity";
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

function ConsentPage() {
  const { request: requestId } = Route.useSearch();
  const request = useQuery(
    api.mcp.getAuthRequest,
    requestId ? { requestId } : "skip",
  );
  const authorize = useAction(api.mcp.authorize);
  const { isAuthenticated, isLoading } = useConvexAuth();
  const identity = useConsentIdentity();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<{
    requestId: string;
    approved: boolean;
  } | null>(null);
  const [confirmed, setConfirmed] = useState<{
    requestId: string;
    code: string;
  } | null>(null);
  const deviceConfirmed =
    request?.kind === "device" &&
    !!request.userCode &&
    confirmed?.requestId === requestId &&
    confirmed?.code === request.userCode;

  const decide = async (approve: boolean) => {
    if (!requestId || pending || !request || request.status !== "pending")
      return;
    if (
      approve &&
      (identity.state !== "ready" || !isAuthenticated || isLoading)
    )
      return;
    if (approve && request.kind === "device" && !deviceConfirmed) return;
    setPending(true);
    setError(null);
    try {
      const { redirectUrl } = await authorize({
        requestId,
        approve,
        ...(approve && request.kind === "device" && deviceConfirmed
          ? { userCode: request.userCode }
          : {}),
      });
      if (redirectUrl) window.location.assign(redirectUrl);
      else {
        setDecision({ requestId, approved: approve });
        setPending(false);
      }
    } catch {
      setError("Could not save your decision. Please try again.");
      setPending(false);
    }
  };

  let content;
  if (decision && decision.requestId === requestId) {
    content = (
      <p role="status">
        {decision.approved
          ? "Connected. Return to your agent to continue."
          : "Connection denied. You can close this page."}
      </p>
    );
  } else if (!requestId) {
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
          connect to {request.serverName}. This name is provided by the agent.
        </p>
        {isAuthenticated && (
          <p aria-live="polite">
            {identity.state === "ready" ? (
              <>
                Signed in as <strong>{identity.label}</strong>
              </>
            ) : identity.state === "loading" ? (
              "Loading your account…"
            ) : (
              "Your account could not be loaded. Refresh and try again."
            )}
          </p>
        )}
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
        {request.kind === "device" ? (
          <div className="space-y-2 text-sm">
            <p className="font-medium">Device code: {request.userCode}</p>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={deviceConfirmed}
                disabled={!request.userCode || pending}
                onChange={(event) =>
                  setConfirmed(
                    event.target.checked && request.userCode
                      ? { requestId, code: request.userCode }
                      : null,
                  )
                }
              />
              I verified this code matches the one shown by my agent.
            </label>
          </div>
        ) : (
          <div className="space-y-1 text-sm">
            <p className="font-medium">Return address</p>
            <p className="break-all text-muted-foreground">
              {request.redirectUri}
            </p>
          </div>
        )}
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
            <Button
              disabled={
                pending ||
                identity.state !== "ready" ||
                (request.kind === "device" && !deviceConfirmed)
              }
              onClick={() => decide(true)}
            >
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
