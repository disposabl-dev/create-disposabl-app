import { useAuthToken } from "@convex-dev/auth/react";
import { ConvexHttpClient } from "convex/browser";
import { useConvex, useConvexAuth } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../../backend/convex/_generated/api";

type Identity = { token: string; label: string };

/** A fresh HTTP query is bound to this token, avoiding cached data from another account. */
export function useConsentIdentity() {
  const token = useAuthToken();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const convex = useConvex();
  const [result, setResult] = useState<
    Identity | { token: string; label: null } | null
  >(null);
  useEffect(() => {
    if (!token || !isAuthenticated || isLoading) return;
    let active = true;
    const client = new ConvexHttpClient(convex.url);
    client.setAuth(token);
    void Promise.all([
      client.query(api.auth.account, {}),
      client.query(api.users.index.current, {}),
    ])
      .then(([account, user]) => {
        if (!active) return;
        const label =
          account && user
            ? account.username?.trim() ||
              account.email?.trim() ||
              account.profile?.email?.trim() ||
              account.profile?.name?.trim() ||
              user.id
            : null;
        setResult({ token, label: label || null });
      })
      .catch(() => {
        if (active) setResult({ token, label: null });
      });
    return () => {
      active = false;
    };
  }, [token, isAuthenticated, isLoading, convex]);
  if (!token || !isAuthenticated || isLoading || result?.token !== token)
    return { state: "loading" as const, label: null };
  return result.label
    ? { state: "ready" as const, label: result.label }
    : { state: "unavailable" as const, label: null };
}
