import { mobileAuthReturnUrl } from "../../../../../packages/disposabl-kit/lib/mobile-auth";
import { PosthogConnection } from "../../components/connections/posthog-connection";
import { useAuthToken } from "@convex-dev/auth/react";
import {
  completeConnections,
  sessionId,
} from "../../components/connections/flow-state";
import { useEffect, useRef, useState } from "react";
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

export function Connections({ onContinue }: { onContinue?: () => void } = {}) {
  const session = sessionId(useAuthToken());
  const [showExpo, setShowExpo] = useState(false);
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const url = new URL(window.location.href);
    if (url.searchParams.get("connect") === "expo") {
      setShowExpo(true);
    }
  }, []);
  const setup = useConnectionSetup();
  const {
    status,
    busy,
    error,
    run,
    connect,
    disconnect,
    mobile,
    analyticsRequired,
    fromCli,
    fromMobile,
    initialized: setupInitialized,
  } = setup;
  const finish = () => {
    completeConnections(sessionStorage, session);
    onContinue?.();
  };
  const completed =
    Number(Boolean(status?.github)) +
    Number(Boolean(status?.convex)) +
    Number(mobile && Boolean(status?.expo)) +
    Number(analyticsRequired && Boolean(status?.posthog));
  const required = 2 + Number(mobile) + Number(analyticsRequired);
  const ready =
    setupInitialized &&
    status?.ready &&
    (!mobile || Boolean(status.expo)) &&
    !busy &&
    Boolean(session);
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

  const renderProvider = ({
    id,
    name,
    description,
  }: (typeof providers)[number]) => {
    if (!status) return null;
    const connected = status[id];
    return (
      <section
        key={id}
        aria-label={name}
        className={`rounded-2xl border bg-card p-5 shadow-sm sm:p-6 ${id === "expo" && !mobile && !connected && !showExpo ? "opacity-80 hover:opacity-100 focus-within:opacity-100" : ""}`}
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
                    ? "Required"
                    : mobile
                      ? "Required for mobile"
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
        {id === "expo" && !connected && showExpo && (
          <ExpoConnection
            busy={busy}
            run={run}
            onConnected={() => setShowExpo(false)}
          />
        )}
      </section>
    );
  };

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
          Connect GitHub and Convex to get started. Add other services when you
          need them.
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
          {providers.filter(({ id }) => id === "convex").map(renderProvider)}
          {providers.filter(({ id }) => id === "expo").map(renderProvider)}
          <PosthogConnection
            connected={status.posthog}
            pending={status.posthogPending}
            required={analyticsRequired}
            available={status.available.posthog}
            busy={busy}
            connect={(region) => connect("posthog", false, region)}
            disconnect={() =>
              void run(async () => {
                await disconnect({ provider: "posthog" });
              })
            }
          />
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
            ? fromCli
              ? "Your accounts are connected. Return to your terminal to finish setup."
              : fromMobile
                ? "Your accounts are connected. Return to the app to start creating."
                : "Your accounts are connected. Continue to your dashboard."
            : "Complete the required connections to continue."}
        </p>
        {ready && fromMobile ? (
          <a
            href={mobileAuthReturnUrl.replace("://login", "://connections")}
            onClick={finish}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Return to Disposabl <ArrowRight className="ml-2 size-4" />
          </a>
        ) : ready && onContinue && !fromCli ? (
          <Button className="min-h-11" onClick={finish}>
            Continue <ArrowRight className="ml-2 size-4" />
          </Button>
        ) : ready ? (
          <Link
            onClick={finish}
            to="/dashboard"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {fromCli ? "Go to dashboard" : "Continue"}{" "}
            <ArrowRight className="ml-2 size-4" />
          </Link>
        ) : (
          <Button disabled className="min-h-11">
            Continue <ArrowRight className="ml-2 size-4" />
          </Button>
        )}
      </div>
    </main>
  );
}
