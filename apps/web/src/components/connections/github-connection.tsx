import { Check } from "lucide-react";
import { Button } from "@disposabl/disposabl-kit/client/components/ui/button";
import { ProviderLogo } from "./provider-logo";
import type { useConnectionSetup } from "./use-connection-setup";

type Setup = ReturnType<typeof useConnectionSetup>;

export function GithubConnection({ setup }: { setup: Setup }) {
  const {
    status,
    busy,
    connect,
    run,
    disconnect,
    installations,
    chooseAccount,
    installNeeded,
    githubPending,
  } = setup;
  const connected = status?.github;
  const available = status?.available.github;

  return (
    <section
      aria-labelledby="github-heading"
      className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-4 sm:flex-nowrap">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border bg-background">
          <ProviderLogo provider="github" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="github-heading" className="font-semibold">
              GitHub
            </h2>
            {connected ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <Check className="size-3" /> Connected
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Required</span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {connected
              ? connected.owner
              : "GitHub stores your app's code and runs its builds."}
          </p>
        </div>
        {connected && (
          <Button
            variant="outline"
            className="min-h-11"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await disconnect({ provider: "github" });
              })
            }
          >
            Disconnect
          </Button>
        )}
      </div>
      {!connected && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            disabled={busy || !available}
            onClick={() => connect("github")}
          >
            Connect GitHub
          </Button>
          {(githubPending || installNeeded) && (
            <Button
              variant="outline"
              disabled={busy || !available}
              onClick={() => connect("github", false)}
            >
              Finish connecting
            </Button>
          )}
          {installNeeded && (
            <p role="status" className="text-sm text-muted-foreground">
              Install Disposabl with the requested permissions, then finish
              connecting.
            </p>
          )}
          {!available && (
            <p className="text-sm text-muted-foreground">
              GitHub setup is temporarily unavailable.
            </p>
          )}
        </div>
      )}
      {connected && (
        <button
          type="button"
          className="mt-4 text-sm underline underline-offset-4 disabled:opacity-50"
          disabled={busy || !available}
          onClick={() => connect("github", false)}
        >
          Change GitHub account
        </button>
      )}
      {installations.length > 1 && (
        <div className="mt-5 border-t pt-4">
          <p className="mb-3 text-sm font-medium">
            Choose where to create your apps
          </p>
          <div className="flex flex-wrap gap-2">
            {installations.map((installation) => (
              <Button
                key={installation.installationId}
                variant="outline"
                disabled={busy}
                onClick={() => chooseAccount(installation.installationId)}
              >
                {installation.owner} ·{" "}
                {installation.organization
                  ? "Organization"
                  : "Personal account"}
              </Button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
