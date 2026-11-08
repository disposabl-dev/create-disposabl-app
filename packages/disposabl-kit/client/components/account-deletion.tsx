import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Component, useRef, useState, type ReactNode } from "react";
import { api } from "../../../backend/convex/_generated/api";
import { authenticationEnabled } from "../../features";

export function AccountDeletion() {
  return authenticationEnabled ? <AuthenticatedDeletion /> : null;
}

function AuthenticatedDeletion() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (isLoading) return <p role="status">Loading account...</p>;
  if (!isAuthenticated)
    return (
      <section className="mt-8">
        <p>Sign in to manage your account deletion request.</p>
        <a
          className="underline"
          href="/login?returnTo=%2Flegal%2Fdelete-account"
        >
          Sign in
        </a>
      </section>
    );
  return (
    <StatusBoundary>
      <DeletionRequest />
    </StatusBoundary>
  );
}

class StatusBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p className="mt-8" role="alert">
        We could not load your deletion request status. Refresh this page to try
        again.
      </p>
    ) : (
      this.props.children
    );
  }
}

type Requested = { status: "requested"; requestedAt: number };

function DeletionRequest() {
  const status = useQuery(api.users.index.deletionStatus, {});
  const requestDeletion = useMutation(api.users.index.requestDeletion);
  const [submitted, setSubmitted] = useState<Requested | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);

  const request = async () => {
    if (inFlight.current || confirmation !== "DELETE") return;
    inFlight.current = true;
    setSending(true);
    try {
      setSubmitted(await requestDeletion({ confirmation: "DELETE" }));
    } catch {
      setFailed(true);
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };
  const requested = status || submitted;
  if (requested)
    return (
      <section className="mt-8" role="status">
        <p>
          Account deletion requested on{" "}
          {new Date(requested.requestedAt).toLocaleString()}.
        </p>
        <p>
          The request is recorded; deletion is not confirmed. Connected services
          or running work may still require attention.
        </p>
      </section>
    );
  if (status === undefined)
    return (
      <p className="mt-8" role="status">
        Loading deletion request status...
      </p>
    );
  if (failed)
    return (
      <p className="mt-8" role="alert">
        We could not confirm your request. Refresh this page to check its status
        before trying again.
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
            This records a request; deletion and cleanup are not immediate. Type
            DELETE to confirm.
          </p>
          <label className="mt-3 block" htmlFor="deletion-confirmation">
            Confirmation
          </label>
          <input
            id="deletion-confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            disabled={sending}
            className="border p-2"
          />
          <div className="mt-3 flex gap-4">
            <button
              type="button"
              disabled={sending || confirmation !== "DELETE"}
              onClick={() => void request()}
              className="underline"
            >
              Confirm deletion request
            </button>
            <button
              type="button"
              disabled={sending}
              onClick={() => {
                setConfirming(false);
                setConfirmation("");
              }}
              className="underline"
            >
              Cancel
            </button>
          </div>
          {sending && <p role="status">Submitting your request...</p>}
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-3 underline"
        >
          Request account deletion
        </button>
      )}
    </section>
  );
}
