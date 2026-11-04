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
              <span className="text-xs text-muted-foreground">Step 1</span>
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
        <div className="mt-5 space-y-5 border-t pt-5">
          <p className="text-sm text-muted-foreground">
            Use your personal GitHub account or an organization you administer.
            A personal account is enough to get started.
          </p>
          <ol className="list-decimal space-y-5 pl-5 text-sm">
            <li className="pl-1">
              <p className="font-medium">Have a GitHub account ready</p>
              <p className="mt-1 text-muted-foreground">
                Already have one? Go to the next step. New to GitHub?{" "}
                <a
                  href="https://github.com/signup"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  Create a free GitHub account
                </a>{" "}
                in a new tab. Finish signup and email verification there, then
                return to this tab.
              </p>
            </li>
            <li className="pl-1">
              <p className="font-medium">Install Disposabl on GitHub</p>
              <p className="mt-1 text-muted-foreground">
                Sign in if asked, then choose your personal account or
                organization. Select All repositories so Disposabl can create
                and build new apps. Click Install on GitHub.
              </p>
              <Button
                className="mt-3 min-h-11"
                disabled={busy || !available}
                onClick={() => connect("github")}
              >
                Install Disposabl on GitHub
              </Button>
              {!available && (
                <p className="mt-2 text-muted-foreground">
                  GitHub setup is temporarily unavailable. Please try again
                  later.
                </p>
              )}
            </li>
            <li className="pl-1">
              <p className="font-medium">Finish connecting your account</p>
              <p className="mt-1 text-muted-foreground">
                GitHub returns you here to finish authorization. If it leaves
                you on GitHub, return to this tab and use the button below. This
                step confirms which account owns your apps.
              </p>
              <Button
                variant="outline"
                className="mt-3 min-h-11"
                disabled={busy || !available}
                onClick={() => connect("github", false)}
              >
                Finish connecting GitHub
              </Button>
            </li>
          </ol>
          {githubPending && !installNeeded && installations.length === 0 && (
            <p className="text-sm text-muted-foreground">
              GitHub setup is not complete yet. Finish connecting above if you
              already installed Disposabl.
            </p>
          )}
          {installNeeded && (
            <p role="status" className="rounded-lg bg-muted p-3 text-sm">
              We could not find a usable Disposabl installation for this GitHub
              login. Install it on your personal account or an organization you
              administer, with the requested permissions, then finish
              connecting.
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
