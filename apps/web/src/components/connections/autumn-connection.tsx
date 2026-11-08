import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../../../../packages/backend/convex/_generated/api";
import { Button } from "@disposabl/disposabl-kit/client/components/ui/button";
import { Input } from "@disposabl/disposabl-kit/client/components/ui/input";

export function AutumnConnection({
  connected,
  required,
  available,
  busy,
  run,
  disconnect,
}: {
  connected: { name: string } | null;
  required: boolean;
  available: boolean;
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
  disconnect: () => Promise<void>;
}) {
  const connect = useAction(api.connections.index.connectAutumn);
  const [editing, setEditing] = useState(false);
  const [sandboxKey, setSandboxKey] = useState("");
  const [liveKey, setLiveKey] = useState("");
  return (
    <section
      aria-label="Autumn"
      className={`rounded-2xl border bg-card p-5 shadow-sm sm:p-6 ${!required && !connected && !editing ? "opacity-80 hover:opacity-100 focus-within:opacity-100" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex-1">
          <h2 className="font-semibold">Autumn</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {connected?.name ??
              (required ? "Required for payments" : "Optional · For payments")}
          </p>
        </div>
        {connected && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void run(disconnect)}
          >
            Disconnect
          </Button>
        )}
        <Button
          disabled={busy || !available}
          onClick={() => {
            setEditing(!editing);
            setSandboxKey("");
            setLiveKey("");
          }}
        >
          {editing ? "Cancel" : connected ? "Replace keys" : "Connect Autumn"}
        </Button>
      </div>
      {connected && (
        <p className="mt-3 text-sm text-muted-foreground">
          Disconnecting or replacing keys does not disable credentials already
          installed in your apps. Revoke those credentials separately in Autumn.
        </p>
      )}
      {editing && (
        <form
          className="mt-5 space-y-4 border-t pt-5"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await connect({
                sandboxKey,
                ...(liveKey.trim() ? { liveKey } : {}),
              });
              setSandboxKey("");
              setLiveKey("");
              setEditing(false);
            });
          }}
        >
          <p className="text-sm text-muted-foreground">
            Use keys from your Autumn account. Sandbox keys configure
            development apps. An optional live key configures production
            payments. Keys are stored encrypted and never included in your app
            bundle.
          </p>
          <label className="block space-y-2 text-sm font-medium">
            Sandbox secret key
            <Input
              type="password"
              autoComplete="off"
              required
              value={sandboxKey}
              onChange={(e) => setSandboxKey(e.target.value)}
            />
          </label>
          <label className="block space-y-2 text-sm font-medium">
            Live secret key (optional)
            <Input
              type="password"
              autoComplete="off"
              value={liveKey}
              onChange={(e) => setLiveKey(e.target.value)}
            />
          </label>
          <p className="text-sm text-muted-foreground">
            Leaving the live key empty removes it from this connection. Existing
            app credentials remain active.
          </p>
          <a
            className="block text-sm underline"
            href="https://app.useautumn.com"
            target="_blank"
            rel="noreferrer"
          >
            Open Autumn developer settings
          </a>
          <p className="text-sm text-muted-foreground">
            Setup applies these keys to your selected apps. Configure the
            monthly and top-up plans in Autumn before accepting payments.
            Disconnecting here does not revoke keys already installed in an app.
          </p>
          <Button type="submit" disabled={busy || !sandboxKey.trim()}>
            Verify and save keys
          </Button>
        </form>
      )}
    </section>
  );
}
