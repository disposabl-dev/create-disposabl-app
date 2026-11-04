import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ArrowRight } from "lucide-react";
import { Button } from "@disposabl/disposabl-kit/client/components/ui/button";
import { ProviderLogo } from "../../components/connections/provider-logo";
import { ExpoConnection } from "../../components/connections/expo-connection";
import { GithubConnection } from "../../components/connections/github-connection";
import { useConnectionSetup } from "../../components/connections/use-connection-setup";

export const Route = createFileRoute(
  "/_providers/_authenticated/dashboard/connections",
)({ component: Connections });

function Connections() {
  const setup = useConnectionSetup();
  const { status, busy, error, run, connect, disconnect, mobile } = setup;
  const [showExpo, setShowExpo] = useState(false);
  const completed =
    Number(Boolean(status?.github)) +
    Number(Boolean(status?.convex)) +
    Number(mobile && Boolean(status?.expo));
  const required = mobile ? 3 : 2;
  const ready = status?.ready && (!mobile || Boolean(status.expo));
  const providers = [
    {
      id: "convex",
      name: "Convex",
      description: "Store your app's data in your own account.",
    },
    {
      id: "expo",
      name: "Expo",
      description: "Connect your mobile app builds and updates.",
    },
  ] as const;

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-16">
      <header className="mb-8 sm:mb-10">
        <p className="mb-3 text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          Set up your workspace
        </p>
        <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Connect your accounts.
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
          Start with GitHub for your code, then Convex for your app's data.{" "}
          {mobile
            ? "Your mobile app also needs Expo."
            : "Add Expo if you want a mobile app."}{" "}
          Your code and data stay in accounts you control.
        </p>
      </header>
      <div className="mb-5 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">Setup progress</span>
        <span className="text-muted-foreground">
          {completed} of {required} connected
        </span>
      </div>
      <div
        className="mb-6 flex gap-1.5"
        aria-label={`${completed} of ${required} required accounts connected`}
      >
        {Array.from({ length: required }, (_, i) => i + 1).map((step) => (
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
          <GithubConnection setup={setup} />
          {providers.map(({ id, name, description }) => {
            const connected = status[id];
            return (
              <section
                key={id}
                aria-label={name}
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
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {id === "convex"
                            ? "Step 2"
                            : mobile
                              ? "Step 3 · Required for mobile"
                              : "Optional · For mobile"}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {connected ? connected.name : description}
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
                      {id === "expo" && showExpo ? "Cancel" : `Connect ${name}`}
                    </Button>
                  )}
                </div>
                {!status.available[id] && !connected && (
                  <p className="mt-4 text-sm text-muted-foreground">
                    Temporarily unavailable.
                  </p>
                )}
                {id === "convex" && !connected && (
                  <p className="mt-4 text-sm text-muted-foreground">
                    Continue to Convex, sign in or create an account, then
                    choose a team and approve access. You will return here when
                    it is connected.
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
          Finishing authorization. You may be redirected to confirm access…
        </p>
      )}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t pt-6">
        <p className="text-sm text-muted-foreground">
          {ready
            ? "Your accounts are connected. Continue here or return to your terminal."
            : "Complete the required connections to continue."}
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
          Accounts are free to create. GitHub Actions runs your builds. Build
          and hosting services have usage limits; charges may apply beyond
          included allowances.
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
          . You can revoke access in each provider's settings.
        </p>
      </aside>
    </main>
  );
}
