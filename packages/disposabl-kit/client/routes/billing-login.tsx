import { createFileRoute } from "@tanstack/react-router";
import { useAuthActions } from "@convex-dev/auth/react";
import { makeFunctionReference } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { useLayoutEffect, useRef, useState } from "react";
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
    purchase: "monthly" | "topup";
    expiresAt: number;
    returnClaim: string | null;
  }
>("billingHandoff:redeem");
function BillingLogin() {
  const [framed] = useState(
    () => typeof window !== "undefined" && window.top !== window.self,
  );
  const [code, setCode] = useState(() =>
    typeof window === "undefined" ? "" : window.location.hash.slice(1),
  );
  const account = useQuery(inspect, code && !framed ? { code } : "skip");
  const exchange = useMutation(redeem);
  const { setSession } = useAuthActions();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [adopting, setAdopting] = useState(false);
  const generation = useRef(0);
  const currentCode = useRef(code);
  const inFlight = useRef(false);
  const adoption = useRef(false);
  useLayoutEffect(() => {
    const scrub = () =>
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname,
      );
    const changed = (event: HashChangeEvent) => {
      const fragment = new URL(event.newURL).hash;
      if (window.location.hash !== fragment) return;
      generation.current++;
      currentCode.current = fragment.slice(1);
      inFlight.current = false;
      setPending(false);
      setError("");
      setCode(fragment.slice(1));
      scrub();
    };
    scrub();
    window.addEventListener("hashchange", changed);
    return () => {
      generation.current++;
      window.removeEventListener("hashchange", changed);
    };
  }, []);
  async function proceed() {
    if (
      !account?.name ||
      pending ||
      inFlight.current ||
      adoption.current ||
      code !== currentCode.current
    )
      return;
    const version = generation.current;
    inFlight.current = true;
    setPending(true);
    try {
      const { purchase, expiresAt, returnClaim, ...tokens } = await exchange({
        code,
      });
      if (version !== generation.current) return;
      adoption.current = true;
      setAdopting(true);
      try {
        await setSession(tokens);
      } finally {
        adoption.current = false;
        setAdopting(false);
      }
      if (version !== generation.current) return;
      window.sessionStorage.setItem(
        "billing-from-ios",
        JSON.stringify({
          purchase,
          expiresAt,
          userId: tokens.userId,
          returnClaim,
        }),
      );
      window.location.replace("/pricing?source=ios");
    } catch {
      if (version === generation.current) {
        setError(
          "This link could not sign you in. Open billing again from the app.",
        );
      }
    } finally {
      if (version === generation.current) {
        inFlight.current = false;
        setPending(false);
      }
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
          <Button disabled={pending || adopting} onClick={() => void proceed()}>
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
