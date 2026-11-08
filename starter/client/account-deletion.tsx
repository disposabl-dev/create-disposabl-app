import { useConvexAuth } from "convex/react";
import { useState } from "react";
import { authenticationEnabled } from "../../features";

// The backend owner must map only confirmed server states to this interface.
export type DeletionState =
  "unavailable" | "idle" | "pending" | "failed" | "completed";

export function AccountDeletion() {
  return authenticationEnabled ? <AuthenticatedDeletion /> : null;
}

function AuthenticatedDeletion() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (isLoading)
    return (
      <p className="mt-8" role="status">
        Loading account...
      </p>
    );
  if (!isAuthenticated)
    return (
      <section className="mt-8">
        <p role="status">Account deletion requests are not available yet.</p>
        <p>Sign in to manage your account deletion request.</p>
        <a
          className="underline"
          href="/login?returnTo=%2Flegal%2Fdelete-account"
        >
          Sign in
        </a>
      </section>
    );
  // No request or status endpoint is connected until the backend contract is available.
  return <DeletionPanel state="unavailable" />;
}

export function DeletionPanel({
  state,
  onRequest,
}: {
  state: DeletionState;
  onRequest?: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  if (state === "unavailable")
    return (
      <p className="mt-8" role="status">
        Account deletion requests are not available yet.
      </p>
    );
  if (state === "pending")
    return (
      <p className="mt-8" role="status">
        Your deletion request is pending. Your account has not yet been deleted.
      </p>
    );
  if (state === "failed")
    return (
      <p className="mt-8" role="alert">
        We could not confirm your deletion request. Check its status before
        trying again.
      </p>
    );
  if (state === "completed")
    return (
      <p className="mt-8" role="status">
        Your account deletion has been completed.
      </p>
    );
  return (
    <section className="mt-8" aria-labelledby="deletion-heading">
      <h2 id="deletion-heading" className="text-xl font-semibold">
        Delete your account
      </h2>
      {confirming ? (
        <>
          <p className="mt-3">
            Request deletion of your account and associated data?
          </p>
          <div className="mt-3 flex gap-4">
            <button
              type="button"
              disabled={!onRequest}
              onClick={onRequest}
              className="underline"
            >
              Confirm deletion request
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="underline"
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          disabled={!onRequest}
          onClick={() => setConfirming(true)}
          className="mt-3 underline"
        >
          Request account deletion
        </button>
      )}
    </section>
  );
}
