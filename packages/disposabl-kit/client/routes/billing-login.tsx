import { createFileRoute } from "@tanstack/react-router";
import { useAuthActions } from "@convex-dev/auth/react";
import { makeFunctionReference } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { PasswordPage } from "../components/password-page";
import { Button } from "../components/ui/button";

export const Route = createFileRoute("/_providers/billing-login")({
  component: BillingLogin,
});
const inspect = makeFunctionReference<
  "query",
  { code: string },
  { name: string | null } | null
>("billingHandoff:inspect");
const redeem = makeFunctionReference<
  "mutation",
  { code: string },
  {
    accessToken: string;
    refreshToken: string;
    refreshTokenExpiresAt: number;
    userId: string;
  }
>("billingHandoff:redeem");
function BillingLogin() {
  const [framed] = useState(
    () => typeof window !== "undefined" && window.top !== window.self,
  );
  const [code] = useState(() =>
    typeof window === "undefined" ? "" : window.location.hash.slice(1),
  );
  const account = useQuery(inspect, code && !framed ? { code } : "skip");
  const exchange = useMutation(redeem);
  const { setSession } = useAuthActions();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname,
    );
  }, []);
  async function proceed() {
    if (!account?.name || pending) return;
    setPending(true);
    try {
      await setSession(await exchange({ code }));
      window.sessionStorage.setItem("billing-from-ios", "1");
      window.location.replace("/pricing?source=ios");
    } catch {
      setError(
        "This link could not sign you in. Open billing again from the app.",
      );
      setPending(false);
    }
  }
  return (
    <PasswordPage
      title="Continue from the app"
      description="Sign in to view website pricing."
    >
      {framed ? (
        <p role="alert">Open this link directly in your browser.</p>
      ) : account === undefined && code ? (
        <p>Checking your account…</p>
      ) : account?.name ? (
        <>
          <p className="break-words font-medium">{account.name}</p>
          <p>This signs this browser into the account shown above.</p>
          <Button disabled={pending} onClick={() => void proceed()}>
            {pending ? "Signing in…" : `Continue as ${account.name}`}
          </Button>
        </>
      ) : (
        <p role="alert">
          This link expired or your account could not be identified. Open
          billing again from the app.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </PasswordPage>
  );
}
