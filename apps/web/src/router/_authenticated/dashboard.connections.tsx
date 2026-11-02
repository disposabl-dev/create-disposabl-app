import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../../../../packages/backend/convex/_generated/api";
import { Button } from "@disposabl/disposabl-kit/client/components/ui/button";
import { Input } from "@disposabl/disposabl-kit/client/components/ui/input";

export const Route = createFileRoute(
  "/_providers/_authenticated/dashboard/connections",
)({ component: Connections });
type Installation = { installationId: string; owner: string };

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
    const provider = url.searchParams.get("provider");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const denial = url.searchParams.get("error");
    if (url.searchParams.has("installation_id")) setReturnedFromInstall(true);
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
    if (denial) {
      setError("Authorization was cancelled or denied. Please try again.");
      return;
    }
    if ((provider !== "github" && provider !== "convex") || !code || !state)
      return;
    setBusy(true);
    void complete({ provider, code, state })
      .then((result) => {
        if (provider === "github") {
          setInstallations(result.installations);
          setProof(result.proof);
          setInstallNeeded(result.installations.length === 0);
        }
      })
      .catch(fail)
      .finally(() => setBusy(false));
  }, [complete]);

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
  const providers = [
    { id: "github", name: "GitHub", description: "Code and releases" },
    {
      id: "convex",
      name: "Convex",
      description: "Backend and data",
    },
    { id: "expo", name: "Expo", description: "Mobile builds and updates" },
  ] as const;
  return (
    <main className="mx-auto max-w-xl space-y-6 px-5 py-10 sm:py-16">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Connections</h1>
      </header>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!status ? (
        <p role="status">Loading…</p>
      ) : (
        <div className="space-y-3">
          {providers.map(({ id, name, description }) => {
            const connected = status[id];
            return (
              <section key={id} className="space-y-4 rounded-xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <h2 className="font-medium">
                      {name}{" "}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        {id === "expo" ? "Optional" : "Required"}
                      </span>
                    </h2>
                    <p className="text-sm text-muted-foreground">
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
                      className="min-h-11 shrink-0"
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
                      className="min-h-11 shrink-0"
                      disabled={busy || !status.available[id]}
                      onClick={() => {
                        if (id === "expo") {
                          setShowExpo(!showExpo);
                          return;
                        }
                        void run(async () => {
                          window.location.assign(await start({ provider: id }));
                        });
                      }}
                    >
                      {returnedFromInstall && id === "github"
                        ? "Continue"
                        : id === "expo" && showExpo
                          ? "Cancel"
                          : "Connect"}
                    </Button>
                  )}
                </div>
                {!status.available[id] && !connected && (
                  <p className="text-xs text-muted-foreground">
                    Temporarily unavailable.
                  </p>
                )}
                {id === "expo" && !connected && showExpo && (
                  <form
                    className="space-y-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void run(async () => {
                        if (!accounts.length) {
                          const result = await expoAccounts({ token });
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
                    <label className="block space-y-1 text-sm">
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
                      className="inline-block text-xs underline underline-offset-4"
                      href="https://expo.dev/settings/access-tokens"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Get an Expo token
                    </a>
                    {accounts.length > 0 && (
                      <label className="block space-y-1 text-sm">
                        Account
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
                    <Button
                      type="submit"
                      className="min-h-11"
                      disabled={busy || !token.trim()}
                    >
                      {accounts.length ? "Save connection" : "Verify token"}
                    </Button>
                  </form>
                )}
                {id === "github" && installations.length > 0 && (
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
                )}
                {id === "github" && installNeeded && (
                  <p className="text-sm">
                    Install Disposabl, then connect again.{" "}
                    {status.githubInstallUrl && (
                      <a className="underline" href={status.githubInstallUrl}>
                        Install on GitHub
                      </a>
                    )}
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}
      {busy && (
        <p role="status" className="text-sm">
          Connecting…
        </p>
      )}
      {status?.ready && (
        <p role="status" className="text-sm">
          You're ready. Continue in your terminal.
        </p>
      )}
      <div className="space-y-3 text-xs text-muted-foreground">
        <p>
          Free to start, with plans for personal projects and early startups.
        </p>
        <details>
          <summary className="cursor-pointer">
            Permissions &amp; security
          </summary>
          <div className="mt-3 space-y-2 leading-relaxed">
            <p>
              GitHub creates repositories and manages builds, releases and CI
              secrets. Convex can create and manage projects in your chosen
              team. Expo tokens are verified before saving.
            </p>
            <p>
              Saved tokens are encrypted. We never ask for your provider
              passwords. Disconnect here to remove saved access; revoke provider
              access and CI tokens in their settings.
            </p>
            <p>
              Free plan limits:{" "}
              <a
                className="underline"
                href="https://github.com/pricing"
                target="_blank"
                rel="noreferrer"
              >
                GitHub
              </a>
              ,{" "}
              <a
                className="underline"
                href="https://www.convex.dev/pricing"
                target="_blank"
                rel="noreferrer"
              >
                Convex
              </a>
              ,{" "}
              <a
                className="underline"
                href="https://expo.dev/pricing"
                target="_blank"
                rel="noreferrer"
              >
                Expo
              </a>
              .
            </p>
          </div>
        </details>
      </div>
      <Link
        to="/dashboard"
        className="inline-block text-sm underline underline-offset-4"
      >
        {status?.ready ? "Go to dashboard" : "Skip for now"}
      </Link>
    </main>
  );
}
