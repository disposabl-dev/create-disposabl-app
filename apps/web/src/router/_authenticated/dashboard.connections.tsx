import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ArrowRight } from "lucide-react";
import { Button } from "@disposabl/disposabl-kit/client/components/ui/button";
import { ProviderLogo } from "../../components/connections/provider-logo";

import { ExpoConnection } from "../../components/connections/expo-connection";
import { useConnectionSetup } from "../../components/connections/use-connection-setup";

export const Route = createFileRoute(
  "/_providers/_authenticated/dashboard/connections",
)({ component: Connections });

function Connections() {
  const {
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
  } = useConnectionSetup();
  const [showExpo, setShowExpo] = useState(false);
  const [blacksmithOpened, setBlacksmithOpened] = useState(false);
  const providers = [
    {
      id: "github",
      name: "GitHub",
      description:
        "Install Disposabl in a GitHub organization to keep your code there.",
    },
    {
      id: "blacksmith",
      name: "Blacksmith",
      description:
        "Faster builds. Includes 3,000 free build minutes per month.",
    },
    {
      id: "convex",
      name: "Convex",
      description: "Store your app’s data in your own account.",
    },
    {
      id: "expo",
      name: "Expo",
      description: "Connect your mobile app builds and updates.",
    },
  ] as const;
  const completed =
    Number(Boolean(status?.github?.organization)) +
    Number(Boolean(status?.blacksmith)) +
    Number(Boolean(status?.convex));
  const ready = status?.ready && (!mobile || Boolean(status.expo));

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-16">
      <header className="mb-8 sm:mb-10">
        <p className="mb-3 text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          Set up your workspace
        </p>
        <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Set up your app in three steps.
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
          All accounts are free to create. Your code and app data stay in your
          accounts. Add Expo for mobile apps.
        </p>
      </header>
      <div className="mb-5 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">Connect your accounts</span>
        <span className="text-muted-foreground">{completed} of 3 ready</span>
      </div>
      <div
        className="mb-6 flex gap-1.5"
        aria-label={`${completed} of 3 steps ready`}
      >
        {[1, 2, 3].map((step) => (
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
            const connected =
              id === "github" && !status.github?.organization
                ? null
                : status[id];
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
                          <Check className="size-3" />{" "}
                          {id === "blacksmith"
                            ? "Confirmed by you"
                            : "Connected"}
                        </span>
                      ) : id === "expo" ? (
                        <span className="text-xs text-muted-foreground">
                          {mobile
                            ? "Required for your mobile app"
                            : "For mobile"}
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
                      {id === "blacksmith"
                        ? "Reset confirmation"
                        : "Disconnect"}
                    </Button>
                  ) : (
                    <Button
                      className="min-h-11"
                      disabled={busy || !status.available[id]}
                      onClick={() =>
                        id === "expo"
                          ? setShowExpo(!showExpo)
                          : id === "blacksmith"
                            ? (() => {
                                window.open(
                                  status.blacksmithInstallUrl,
                                  "_blank",
                                  "noopener,noreferrer",
                                );
                                setBlacksmithOpened(true);
                              })()
                            : connect(id)
                      }
                    >
                      {id === "expo" && showExpo
                        ? "Cancel"
                        : id === "github"
                          ? "Install Disposabl"
                          : id === "blacksmith"
                            ? "Install Blacksmith"
                            : "Connect"}
                    </Button>
                  )}
                </div>
                {!status.available[id] && !connected && (
                  <p className="mt-4 text-sm text-muted-foreground">
                    {id === "blacksmith"
                      ? "Complete GitHub setup first."
                      : "Temporarily unavailable."}
                  </p>
                )}
                {id === "github" && !connected && (
                  <p className="mt-4 text-sm text-muted-foreground">
                    A GitHub organization is a workspace for your apps. It’s
                    free and you can use it on your own.{" "}
                    <a
                      href="https://github.com/organizations/plan"
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium underline underline-offset-4"
                    >
                      Create a free organization
                    </a>
                    .
                  </p>
                )}
                {id === "github" && !connected && (
                  <details
                    className="mt-3 rounded-lg bg-muted/50 p-4 text-sm"
                    open={installNeeded || undefined}
                  >
                    <summary className="cursor-pointer font-medium">
                      New to GitHub? Follow these steps
                    </summary>
                    <ol className="mt-3 list-decimal space-y-2 pl-5 text-muted-foreground">
                      <li>
                        Sign in to GitHub or{" "}
                        <a
                          className="underline"
                          href="https://github.com/signup"
                          target="_blank"
                          rel="noreferrer"
                        >
                          create a free account
                        </a>
                        .
                      </li>
                      <li>
                        Open{" "}
                        <a
                          className="underline"
                          href="https://github.com/organizations/plan"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Create an organization
                        </a>{" "}
                        and choose the <strong>Free</strong> plan. This creates
                        a workspace; it does not replace your personal account.
                      </li>
                      <li>
                        Choose a name, add your email, and complete GitHub’s
                        verification. You can skip inviting other people.
                      </li>
                      <li>
                        Return here, click <strong>Install Disposabl</strong>,
                        and select your new organization. Approve GitHub’s
                        requested access to finish this step.
                      </li>
                    </ol>
                  </details>
                )}
                {id === "blacksmith" && (
                  <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                    <p>
                      Install in{" "}
                      {status.github?.organization ? (
                        <strong>{status.github.owner}</strong>
                      ) : (
                        "the same GitHub organization"
                      )}{" "}
                      and choose All repositories so newly created apps can
                      build.{" "}
                      <a
                        href="https://www.blacksmith.sh/pricing"
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-4"
                      >
                        Free-minute allowance
                      </a>{" "}
                      varies by runner size and platform.
                    </p>
                    {blacksmithOpened &&
                      !connected &&
                      status.github?.organization && (
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await confirmBlacksmith({
                                owner: status.github!.owner,
                              });
                            })
                          }
                        >
                          I’ve installed Blacksmith in {status.github.owner}
                        </Button>
                      )}
                  </div>
                )}
                {id === "github" && installations.length > 1 && (
                  <div className="mt-5 border-t pt-4">
                    <p className="mb-3 text-sm font-medium">
                      Choose your organization
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {installations.map((installation) => (
                        <Button
                          key={installation.installationId}
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            chooseOrganization(installation.installationId)
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
                    Your next step is to choose or create a free organization.
                    Follow the guide above, then install Disposabl in that
                    workspace.
                  </p>
                )}
                {id === "expo" && !connected && showExpo && (
                  <ExpoConnection
                    busy={busy}
                    run={run}
                    onConnected={() => setShowExpo(false)}
                  />
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
          {ready
            ? "Your accounts are connected. Continue in your terminal or dashboard."
            : "Complete the required setup steps to continue."}
        </p>
        {ready ? (
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
      <aside className="mt-8 space-y-2 border-t pt-6 text-sm leading-6 text-muted-foreground">
        <p>
          Accounts are free to create. Build and hosting services have free
          usage allowances; charges may apply beyond those limits.
        </p>
        <p>
          Your repositories and backend belong to you. Disposabl uses the access
          you grant to set up and deploy your app, and stores encrypted
          connection credentials and setup metadata.
        </p>
        <p>
          Open source.{" "}
          <a
            href="https://github.com/disposabl-dev/create-disposabl-app"
            target="_blank"
            rel="noreferrer"
            className="font-medium underline underline-offset-4"
          >
            Read the code on GitHub
          </a>
          . You can revoke access in each provider’s settings.
        </p>
      </aside>
    </main>
  );
}
