import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../../../packages/backend/convex/_generated/api";
import { Button } from "@disposabl/disposabl-kit/client/components/ui/button";
import { Input } from "@disposabl/disposabl-kit/client/components/ui/input";
import config from "../../../../../disposabl.json";

export const Route = createFileRoute(
  "/_providers/_authenticated/dashboard/api-keys",
)({ component: ApiKeys });
export function ApiKeys() {
  const enabled = config.platforms.includes("api");
  const connections = useQuery(api.mcp.listConnections, enabled ? {} : "skip");
  const create = useAction(api.mcp.createApiKey);
  const revoke = useMutation(api.mcp.revokeConnection);
  const [name, setName] = useState("");
  const [key, setKey] = useState<string>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  if (!enabled)
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-2xl font-semibold">API access is not enabled</h1>
      </main>
    );
  const keys = connections?.filter(
    (connection) => connection.kind === "apiKey",
  );
  return (
    <main className="mx-auto max-w-xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">API keys</h1>
      <p>
        Use a key with the API or TypeScript SDK. Each key can access your data
        through all enabled operations.
      </p>
      <form
        className="flex gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          if (pending) return;
          setPending(true);
          setError(undefined);
          try {
            const result = await create({ name: name.trim(), scopes: [] });
            setKey(result.apiKey);
            setName("");
            setCopied(false);
          } catch {
            setError("Could not create the key. Please try again.");
          } finally {
            setPending(false);
          }
        }}
      >
        <label className="flex-1">
          Key name
          <Input
            value={name}
            maxLength={100}
            required
            onChange={(event) => setName(event.target.value)}
            placeholder="My integration"
          />
        </label>
        <Button
          type="submit"
          className="self-end"
          disabled={pending || !name.trim() || !!key}
        >
          Create key
        </Button>
      </form>
      {key && (
        <section
          className="space-y-3 rounded border p-4"
          aria-label="New API key"
        >
          <p>Copy this key now. It will not be shown again.</p>
          <label className="block">
            API key
            <textarea
              className="mt-2 w-full rounded border p-2 font-mono text-sm"
              readOnly
              value={key}
              spellCheck={false}
            />
          </label>
          <div className="flex gap-2">
            <Button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(key);
                  setCopied(true);
                } catch {
                  setError("Copy failed. Select and copy the key manually.");
                }
              }}
            >
              {copied ? "Copied" : "Copy key"}
            </Button>
            <Button variant="outline" onClick={() => setKey(undefined)}>
              Done
            </Button>
          </div>
        </section>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {keys === undefined ? (
        <p role="status">Loading keys…</p>
      ) : (
        <ul className="space-y-3">
          {keys.map((connection) => (
            <li
              key={connection.id}
              className="flex items-center justify-between gap-4 rounded border p-4"
            >
              <div>
                <p className="font-medium">{connection.name}</p>
                <p className="text-sm text-muted-foreground">
                  Created {new Date(connection.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Button
                variant="outline"
                disabled={pending}
                onClick={async () => {
                  setPending(true);
                  setError(undefined);
                  try {
                    await revoke({ id: connection.id });
                    setKey(undefined);
                  } catch {
                    setError("Could not revoke the key. Please try again.");
                  } finally {
                    setPending(false);
                  }
                }}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
      {keys?.length === 0 && <p>No API keys yet.</p>}
    </main>
  );
}
