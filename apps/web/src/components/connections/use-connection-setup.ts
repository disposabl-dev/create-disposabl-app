import { useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../../../../packages/backend/convex/_generated/api";

type Provider = "github" | "convex";
type Installation = { installationId: string; owner: string };
const pendingKey = "disposabl.pendingConnectionProvider";
const isProvider = (value: string | null): value is Provider =>
  value === "github" || value === "convex";

export function useConnectionSetup() {
  const status = useQuery(api.connections.index.status, {});
  const start = useAction(api.connections.index.start);
  const resumeInstall = useAction(api.connections.index.resumeGithubInstall);
  const confirmBlacksmith = useMutation(
    api.connections.index.confirmBlacksmith,
  );
  const complete = useAction(api.connections.index.complete);
  const selectGithub = useAction(api.connections.index.selectGithub);
  const disconnect = useMutation(api.connections.index.disconnect);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [proof, setProof] = useState<string>();
  const [installNeeded, setInstallNeeded] = useState(false);
  const [mobile, setMobile] = useState(false);
  const consumed = useRef(false);
  const fail = (cause: unknown) =>
    setError(
      cause instanceof ConvexError && typeof cause.data === "string"
        ? cause.data
        : cause instanceof Error
          ? cause.message
          : "Something went wrong. Please try again.",
    );

  useEffect(() => {
    if (consumed.current) return;
    consumed.current = true;
    const url = new URL(window.location.href);
    const mobileKey = "disposabl.setupMobile";
    if (url.searchParams.has("mobile"))
      sessionStorage.setItem(
        mobileKey,
        url.searchParams.get("mobile") === "1" ? "1" : "0",
      );
    setMobile(sessionStorage.getItem(mobileKey) === "1");
    const queryProvider = url.searchParams.get("provider");
    const pending = sessionStorage.getItem(pendingKey);
    const provider = isProvider(queryProvider)
      ? queryProvider
      : isProvider(pending)
        ? pending
        : null;
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const denial = url.searchParams.get("error");
    const installationReturn =
      url.searchParams.has("installation_id") ||
      url.searchParams.has("setup_action");
    // Remove callback credentials even after a denial or malformed response.
    for (const key of [
      "installation_id",
      "setup_action",
      "state",
      "code",
      "provider",
      "error",
      "error_description",
    ])
      url.searchParams.delete(key);
    window.history.replaceState(window.history.state, "", url.toString());
    if (denial) {
      sessionStorage.removeItem(pendingKey);
      setError(
        "Authorization was cancelled. Use the setup button to try again.",
      );
      return;
    }
    if (installationReturn) {
      setBusy(true);
      sessionStorage.setItem(pendingKey, "github");
      void (state ? resumeInstall({ state }) : start({ provider: "github" }))
        .then((next) => window.location.assign(next))
        .catch(fail)
        .finally(() => setBusy(false));
      return;
    }
    const callback =
      code !== null ||
      state !== null ||
      denial !== null ||
      queryProvider !== null;
    if (!callback) return;
    if (!provider || !code || !state) {
      setError(
        "The authorization response is incomplete. Please connect again to restart authorization.",
      );
      return;
    }
    sessionStorage.removeItem(pendingKey);
    setBusy(true);
    void complete({ provider, code, state })
      .then(async (result) => {
        if (provider !== "github") return;
        const installation = result.installations.at(0);
        if (result.installations.length === 1 && installation) {
          if (!result.proof)
            throw new Error(
              "GitHub did not return an account selection proof. Please connect again.",
            );
          await selectGithub({
            proof: result.proof,
            installationId: installation.installationId,
          });
        } else {
          setInstallations(result.installations);
          setProof(result.proof);
          setInstallNeeded(result.installations.length === 0);
        }
      })
      .catch(fail)
      .finally(() => setBusy(false));
  }, [complete, selectGithub, resumeInstall, start]);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }
  function connect(provider: Provider) {
    void run(async () => {
      const url = await start({ provider, install: provider === "github" });
      sessionStorage.setItem(pendingKey, provider);
      window.location.assign(url);
    });
  }

  function chooseOrganization(installationId: string) {
    void run(async () => {
      if (!proof)
        throw new Error("Restart GitHub setup to choose an organization.");
      await selectGithub({ proof, installationId });
      setInstallations([]);
      setProof(undefined);
    });
  }
  return {
    status,
    busy,
    error,
    run,
    connect,
    disconnect,
    installations,
    chooseOrganization,
    installNeeded,
    confirmBlacksmith,
    mobile,
  };
}
