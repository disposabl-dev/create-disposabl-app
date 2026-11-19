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
  connected: boolean;
  required: boolean;
  available: boolean;
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
  disconnect: () => Promise<void>;
}) {
  const connect = useAction(api.connections.index.connectAutumn);
  const [editing, setEditing] = useState(false);
  const [platformKey, setPlatformKey] = useState("");
  return (
    <section
      aria-label="Autumn"
      className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex-1">
          <h2 className="font-semibold">Autumn</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {connected
              ? "Connected"
              : required
                ? "Required for payments"
                : "Optional · For payments"}
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
            setPlatformKey("");
          }}
        >
          {editing ? "Cancel" : connected ? "Replace key" : "Connect Autumn"}
        </Button>
      </div>
      {editing && (
        <form
          className="mt-5 space-y-4 border-t pt-5"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await connect({ platformKey });
              setPlatformKey("");
              setEditing(false);
            });
          }}
        >
          <p className="text-sm text-muted-foreground">
            Use an API key from an Autumn organization approved for Platform API
            access.
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <a
              className="underline"
              href="https://app.useautumn.com"
              target="_blank"
              rel="noreferrer"
            >
              Open Autumn
            </a>
            <a
              className="underline"
              href="https://docs.useautumn.com/api-reference/platform/overview"
              target="_blank"
              rel="noreferrer"
            >
              Get Platform API access
            </a>
          </div>
          <label className="block space-y-2 text-sm font-medium">
            Platform API key
            <Input
              type="password"
              autoComplete="off"
              required
              maxLength={4096}
              value={platformKey}
              onChange={(event) => setPlatformKey(event.target.value)}
            />
          </label>
          <Button type="submit" disabled={busy || !platformKey.trim()}>
            Verify and connect
          </Button>
        </form>
      )}
    </section>
  );
}
