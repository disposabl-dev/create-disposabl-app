import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Check, ArrowRight } from "lucide-react";
import { api } from "../../../../../packages/backend/convex/_generated/api";
import { Button } from "@disposabl/disposabl-kit/client/components/ui/button";
import { Input } from "@disposabl/disposabl-kit/client/components/ui/input";
import { ProviderLogo } from "../../components/connections/provider-logo";

export const Route = createFileRoute(
  "/_providers/_authenticated/dashboard/connections",
)({ component: Connections });

type Provider = "github" | "convex";
type Installation = { installationId: string; owner: string };
const pendingKey = "disposabl.pendingConnectionProvider";
const isProvider = (value: string | null): value is Provider =>
  value === "github" || value === "convex";

function Connections() {
  const status = useQuery(api.connections.index.status, {});
  const start = useAction(api.connections.index.start);
  const complete = useAction(api.connections.index.complete);
  const selectGithub = useAction(api.connections.index.selectGithub);
  const expoAccounts = useAction(api.connections.index.expoAccounts);
  const connectExpo = useAction(api.connections.index.connectExpo);
  const disconnect = useMutation(api.connections.index.disconnect);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [proof, setProof] = useState<string>();
  const [installNeeded, setInstallNeeded] = useState(false);
  const [returnedFromInstall, setReturnedFromInstall] = useState(false);
  const [token, setToken] = useState("");
  const [showExpo, setShowExpo] = useState(false);
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [accountId, setAccountId] = useState("");
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
    if (installationReturn) setReturnedFromInstall(true);
    const callback =
      code !== null ||
      state !== null ||
      denial !== null ||
      queryProvider !== null;
    if (!callback || (installationReturn && !code && !state && !denial)) return;
    if (denial) {
      setError(
        "Authorization was cancelled or denied. Please try connecting again.",
      );
      return;
    }
    if (!provider || !code || !state) {
      setError(
        "The authorization response is incomplete. Please connect again to restart authorization.",
      );
      return;
    }
    // Capture the callback before removing it; the backend verifies the OAuth state.
    for (const key of [
      "provider",
      "code",
      "state",
      "error",
      "error_description",
      "installation_id",
      "setup_action",
    ])
      url.searchParams.delete(key);
    window.history.replaceState(window.history.state, "", url.toString());
    sessionStorage.removeItem(pendingKey);
    setBusy(true);
    void complete({ provider, code, state })
      .then(async (result) => {
        if (provider !== "github") return;
        if (result.installations.length === 1) {
          if (!result.proof)
            throw new Error(
              "GitHub did not return an account selection proof. Please connect again.",
            );
          await selectGithub({
            proof: result.proof,
            installationId: result.installations[0]!.installationId,
          });
        } else {
          setInstallations(result.installations);
          setProof(result.proof);
          setInstallNeeded(result.installations.length === 0);
        }
      })
      .catch(fail)
      .finally(() => setBusy(false));
  }, [complete, selectGithub]);

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
      const url = await start({ provider });
      sessionStorage.setItem(pendingKey, provider);
      window.location.assign(url);
    });
  }
  const providers = [
    {
      id: "github",
      name: "GitHub",
      description: "Create and manage your app's repository.",
    },
    {
      id: "convex",
      name: "Convex",
      description: "Run your backend in your own Convex team.",
    },
    {
      id: "expo",
      name: "Expo",
      description: "Build and update your mobile app.",
    },
  ] as const;
  const completed =
    Number(Boolean(status?.github)) + Number(Boolean(status?.convex));

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-16">
      <header className="mb-8 sm:mb-10">
        <p className="mb-3 text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          Set up your workspace
        </p>
        <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Your code. Your data.
          <br />
          Your accounts.
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
          Connect GitHub and Convex to create your app in accounts you control.
          Add Expo when you're ready to build for mobile.
        </p>
      </header>
      <div className="mb-5 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">Connect your accounts</span>
        <span className="text-muted-foreground">
          {completed} of 2 connected
        </span>
      </div>
      <div
        className="mb-6 flex gap-1.5"
        aria-label={`${completed} of 2 accounts connected`}
      >
        {[1, 2].map((step) => (
          <div
            key={step}
            className={`h-1.5 flex-1 rounded-full ${completed >= step ? "bg-primary" : "bg-muted"}`}
          />
        ))}
      </div>
      {error && (
        <p
          role="alert"
          className="mb-5 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {!status ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading connections…
        </p>
      ) : (
        <div className="space-y-3">
          {providers.map(({ id, name, description }, index) => {
            const connected = status[id];
            return (
              <section
                key={id}
                className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6"
              >
                <div className="flex flex-wrap items-center gap-4 sm:flex-nowrap">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border bg-background">
                    <ProviderLogo provider={id} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{name}</h2>
                      {connected ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          <Check className="size-3" /> Connected
                        </span>
                      ) : id === "expo" ? (
                        <span className="text-xs text-muted-foreground">
                          Optional
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Step {index + 1}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {connected
                        ? "owner" in connected
                          ? connected.owner
                          : connected.name
                        : description}
                    </p>
                  </div>
                  {connected ? (
                    <Button
                      variant="outline"
                      className="min-h-11"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await disconnect({ provider: id });
                        })
                      }
                    >
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      className="min-h-11"
                      disabled={busy || !status.available[id]}
                      onClick={() =>
                        id === "expo" ? setShowExpo(!showExpo) : connect(id)
                      }
                    >
                      {id === "expo" && showExpo
                        ? "Cancel"
                        : id === "github" && returnedFromInstall
                          ? "Connect again"
                          : "Connect"}
                    </Button>
                  )}
                </div>
                {!status.available[id] && !connected && (
                  <p className="mt-4 text-sm text-muted-foreground">
                    Temporarily unavailable.
                  </p>
                )}
                {id === "github" && installations.length > 1 && (
                  <div className="mt-5 border-t pt-4">
                    <p className="mb-3 text-sm font-medium">Select account</p>
                    <div className="flex flex-wrap gap-2">
                      {installations.map((installation) => (
                        <Button
                          key={installation.installationId}
                          variant="outline"
                          disabled={busy || !proof}
                          onClick={() =>
                            void run(async () => {
                              if (!proof) return;
                              await selectGithub({
                                proof,
                                installationId: installation.installationId,
                              });
                              setInstallations([]);
                              setProof(undefined);
                            })
                          }
                        >
                          {installation.owner}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                {id === "github" && installNeeded && (
                  <p className="mt-4 text-sm">
                    Install Disposabl on GitHub, then return here and connect
                    again.{" "}
                    {status.githubInstallUrl && (
                      <a
                        className="font-medium underline underline-offset-4"
                        href={status.githubInstallUrl}
                      >
                        Install on GitHub
                      </a>
                    )}
                  </p>
                )}
                {id === "expo" && !connected && showExpo && (
                  <form
                    className="mt-5 space-y-4 border-t pt-5"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void run(async () => {
                        if (!accounts.length) {
                          const result = await expoAccounts({ token });
                          if (!result.length)
                            throw new Error(
                              "No Expo accounts were found for this token.",
                            );
                          setAccounts(result);
                          setAccountId(result[0]?.id ?? "");
                        } else {
                          await connectExpo({ token, accountId });
                          setToken("");
                          setAccounts([]);
                          setAccountId("");
                          setShowExpo(false);
                        }
                      });
                    }}
                  >
                    <p className="text-sm text-muted-foreground">
                      Verify an Expo access token, then choose the account to
                      save.
                    </p>
                    <label className="block space-y-2 text-sm font-medium">
                      Access token
                      <Input
                        type="password"
                        autoComplete="off"
                        required
                        value={token}
                        onChange={(event) => {
                          setToken(event.target.value);
                          setAccounts([]);
                          setAccountId("");
                        }}
                      />
                    </label>
                    <a
                      className="inline-block text-sm underline underline-offset-4"
                      href="https://expo.dev/settings/access-tokens"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Create an Expo access token
                    </a>
                    {accounts.length > 0 && (
                      <label className="block space-y-2 text-sm font-medium">
                        Expo account
                        <select
                          className="block min-h-11 w-full rounded-md border bg-background px-3"
                          value={accountId}
                          onChange={(event) => setAccountId(event.target.value)}
                        >
                          {accounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <div>
                      <Button
                        type="submit"
                        className="min-h-11"
                        disabled={busy || !token.trim()}
                      >
                        {accounts.length ? "Save account" : "Verify token"}
                      </Button>
                    </div>
                  </form>
                )}
              </section>
            );
          })}
        </div>
      )}
      {busy && (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          Connecting…
        </p>
      )}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t pt-6">
        <p className="text-sm text-muted-foreground">
          {status?.ready
            ? "Your accounts are connected. Continue in your terminal or dashboard."
            : "Connect GitHub and Convex to continue."}
        </p>
        {status?.ready ? (
          <Link
            to="/dashboard"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Continue <ArrowRight className="ml-2 size-4" />
          </Link>
        ) : (
          <Button disabled className="min-h-11">
            Continue <ArrowRight className="ml-2 size-4" />
          </Button>
        )}
      </div>
      <details className="mt-8 text-sm text-muted-foreground">
        <summary className="cursor-pointer font-medium">
          Permissions and security
        </summary>
        <div className="mt-3 space-y-2 leading-relaxed">
          <p>
            GitHub access creates repositories and manages builds, releases and
            CI secrets. Convex access can create and manage projects in your
            selected team. Expo tokens are verified before saving.
          </p>
          <p>
            Saved tokens are encrypted. Disconnect here to remove saved access,
            and revoke provider access and CI tokens in their settings.
          </p>
        </div>
      </details>
    </main>
  );
}
