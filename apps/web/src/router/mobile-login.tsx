import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../packages/backend/convex/_generated/api";
import { PasswordPage } from "../../../../packages/disposabl-kit/client/components/password-page";
import { Button } from "@disposabl/disposabl-kit/client/components/ui/button";

export const Route = createFileRoute("/_providers/mobile-login")({
  component: MobileLogin,
});

function MobileLogin() {
  const [framed] = useState(
    () => typeof window !== "undefined" && window.top !== window.self,
  );
  const [code] = useState(() =>
    typeof window === "undefined" ? "" : window.location.hash.slice(1),
  );
  const account = useQuery(
    api.browserHandoff.inspect,
    code && !framed ? { code } : "skip",
  );
  const redeem = useMutation(api.browserHandoff.redeem);
  const { setSession } = useAuthActions();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    // Keep this single-use credential out of history, referrers and subsequent navigation.
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname,
    );
  }, []);
  async function proceed() {
    if (pending || !account?.name) return;
    setPending(true);
    try {
      const session = await redeem({ code });
      await setSession(session);
      window.location.replace("/dashboard/connections?origin=mobile");
    } catch {
      setError(
        "This link could not sign you in. Open connections again from the app.",
      );
      setPending(false);
    }
  }
  return (
    <PasswordPage
      title="Continue from the app"
      description="Use your signed-in Disposabl account to connect your services."
    >
      {framed ? (
        <p role="alert">Open this link directly in your browser.</p>
      ) : code && account === undefined ? (
        <p>Checking your account…</p>
      ) : account?.name ? (
        <>
          <p className="break-words font-medium">{account.name}</p>
          <p>This signs this browser into the account shown above.</p>
          <Button
            className="min-h-12 w-full"
            disabled={pending}
            onClick={() => void proceed()}
          >
            {pending ? "Signing in…" : `Continue as ${account.name}`}
          </Button>
        </>
      ) : account ? (
        <p role="alert">
          Your account is signed in, but its email is missing. Reconnect Google
          in the app to confirm which account this browser should use.
        </p>
      ) : (
        <p role="alert">
          This link expired. Open connections again from the app.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </PasswordPage>
  );
}
