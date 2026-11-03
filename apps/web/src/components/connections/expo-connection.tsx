import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../../../../packages/backend/convex/_generated/api";
import { Button } from "@disposabl/disposabl-kit/client/components/ui/button";
import { Input } from "@disposabl/disposabl-kit/client/components/ui/input";

export function ExpoConnection({
  busy,
  run,
  onConnected,
}: {
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
  onConnected: () => void;
}) {
  const expoAccounts = useAction(api.connections.index.expoAccounts);
  const connectExpo = useAction(api.connections.index.connectExpo);
  const [token, setToken] = useState("");
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [accountId, setAccountId] = useState("");
  return (
    <form
      className="mt-5 space-y-4 border-t pt-5"
      onSubmit={(event) => {
        event.preventDefault();
        void run(async () => {
          if (!accounts.length) {
            const result = await expoAccounts({ token });
            if (!result.length)
              throw new Error("No Expo accounts were found for this token.");
            setAccounts(result);
            setAccountId(result[0]?.id ?? "");
          } else {
            await connectExpo({ token, accountId });
            setToken("");
            setAccounts([]);
            setAccountId("");
            onConnected();
          }
        });
      }}
    >
      <p className="text-sm text-muted-foreground">
        Verify an Expo access token, then choose the account to save.
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
  );
}
