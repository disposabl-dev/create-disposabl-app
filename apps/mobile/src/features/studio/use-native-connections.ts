import { useAction } from "convex/react";
import { useAuthToken } from "@convex-dev/auth/react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { openAuthSessionAsync } from "expo-web-browser";
import { ConvexError } from "convex/values";
import { api } from "../../../../../packages/backend/convex/_generated/api";
import {
  mobileConnectionReturnUrl,
  readMobileConnectionCallback,
} from "../../../../../packages/backend/convex/connections/mobile";
import { sessionId } from "../../../../../packages/disposabl-kit/lib/auth-session";

type Installation = {
  installationId: string;
  owner: string;
  organization: boolean;
};

/** Authorize providers with the existing mobile session; the browser never receives it. */
export function useNativeConnections() {
  const start = useAction(api.connections.index.start);
  const complete = useAction(api.connections.index.complete);
  const resume = useAction(api.connections.index.resumeGithubInstall);
  const selectGithub = useAction(api.connections.index.selectGithub);
  const session = sessionId(useAuthToken());
  const current = useRef(session);
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selection, setSelection] = useState<{
    session: string;
    proof: string;
    installations: Installation[];
  }>();
  const [installNeeded, setInstallNeeded] = useState(false);
  useLayoutEffect(() => {
    current.current = session;
    return () => {
      current.current = null;
    };
  }, [session]);

  async function run(work: (owner: string) => Promise<void>) {
    if (running.current || !session) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await work(session);
    } catch (cause) {
      if (current.current === session)
        setError(
          cause instanceof ConvexError && typeof cause.data === "string"
            ? cause.data
            : cause instanceof Error
              ? cause.message
              : "Connection failed. Please try again.",
        );
    } finally {
      running.current = false;
      if (current.current) setBusy(false);
    }
  }

  const handled = useRef(new Map<string, Promise<void>>());
  const finish = useCallback(
    function redeem(url: string): Promise<void> {
      const callback = readMobileConnectionCallback(url);
      const existing = handled.current.get(callback.state);
      if (existing) return existing;
      const owner = current.current;
      if (!owner) return Promise.resolve();
      const task = (async () => {
        if (callback.installation) {
          const next = await resume({ state: callback.state });
          if (current.current !== owner) return;
          const response = await openAuthSessionAsync(
            next,
            mobileConnectionReturnUrl,
          );
          if (response.type === "success" && current.current === owner)
            await redeem(response.url);
          return;
        }
        const result = await complete({
          provider: callback.provider,
          code: callback.code,
          state: callback.state,
        });
        if (current.current !== owner || callback.provider !== "github") return;
        if (result.installations.length === 0) {
          setInstallNeeded(true);
          return;
        }
        if (!result.proof)
          throw new Error(
            "GitHub account selection expired. Please try again.",
          );
        if (result.installations.length === 1) {
          await selectGithub({
            proof: result.proof,
            installationId: result.installations[0]!.installationId,
          });
        } else
          setSelection({
            session: owner,
            proof: result.proof,
            installations: result.installations,
          });
      })();
      handled.current.set(callback.state, task);
      return task;
    },
    [complete, resume, selectGithub],
  );

  const connect = (provider: "github" | "convex", install = false) =>
    run(async (owner) => {
      setSelection(undefined);
      setInstallNeeded(false);
      const url = await start({
        provider,
        mobile: true,
        ...(install ? { install: true } : {}),
      });
      if (current.current !== owner) return;
      const response = await openAuthSessionAsync(
        url,
        mobileConnectionReturnUrl,
      );
      if (response.type === "success" && current.current === owner)
        await finish(response.url);
    });
  // A route callback can arrive before the pending browser promise resolves.
  // Both paths share the same redemption promise, including failed redemptions.
  const acceptCallback = useCallback(
    async (url: string) => {
      setBusy(true);
      try {
        await finish(url);
      } catch {
        if (current.current)
          setError("Could not complete the connection. Please try again.");
      } finally {
        if (current.current) setBusy(false);
      }
    },
    [finish],
  );
  const select = (installationId: string) =>
    run(async (owner) => {
      if (!selection || selection.session !== owner)
        throw new Error("Connect GitHub again to select an account.");
      await selectGithub({ proof: selection.proof, installationId });
      if (current.current === owner) setSelection(undefined);
    });
  return {
    busy,
    error,
    connect,
    acceptCallback: session ? acceptCallback : undefined,
    select,
    installations: selection?.installations ?? [],
    installNeeded,
  };
}
