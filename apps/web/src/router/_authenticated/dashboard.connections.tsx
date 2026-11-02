import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../../../packages/backend/convex/_generated/api";
import { Button } from "@disposabl/disposabl-kit/client/components/ui/button";
import { Input } from "@disposabl/disposabl-kit/client/components/ui/input";

export const Route = createFileRoute("/_providers/_authenticated/dashboard/connections")({ component: Connections });
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
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [accountId, setAccountId] = useState("");
  const consumed = useRef(false);
  const fail = (cause: unknown) => setError(cause instanceof Error ? cause.message : "Something went wrong. Please try again.");

  useEffect(() => {
    if (consumed.current) return;
    consumed.current = true;
    const url = new URL(window.location.href);
    const provider = url.searchParams.get("provider");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const denial = url.searchParams.get("error");
    if (url.searchParams.has("installation_id")) setReturnedFromInstall(true);
    for (const key of ["provider", "code", "state", "error", "error_description", "installation_id", "setup_action"]) url.searchParams.delete(key);
    window.history.replaceState(window.history.state, "", url.toString());
    if (denial) { setError("Authorization was cancelled or denied. Please try again."); return; }
    if ((provider !== "github" && provider !== "convex") || !code || !state) return;
    setBusy(true);
    void complete({ provider, code, state }).then((result) => {
      if (provider === "github") {
        setInstallations(result.installations);
        setProof(result.proof);
        setInstallNeeded(result.installations.length === 0);
      }
    }).catch(fail).finally(() => setBusy(false));
  }, [complete]);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(undefined);
    try { await action(); } catch (cause) { fail(cause); } finally { setBusy(false); }
  }
  const descriptions = {
    github: "GitHub creates your repository and runs builds and publishes releases.",
    convex: "Convex creates your project and stores your app data.",
    expo: "Expo enables mobile builds and updates.",
  };
  return <main className="mx-auto max-w-xl space-y-6 p-6">
    <Link to="/dashboard" className="text-sm underline">← Back to dashboard</Link>
    <header className="space-y-2"><h1 className="text-2xl font-semibold">Connections</h1>
      <p>Connect your own accounts to create and run your app. You can skip this and return to your dashboard anytime.</p>
      <p className="text-sm text-muted-foreground">We never ask for your provider passwords. Tokens are encrypted on the server and can be revoked with the provider. Convex team authorization grants access to the team.</p>
    </header>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {!status ? <p role="status">Loading connections…</p> : <>
      <p>{status.ready ? "Your required accounts are connected." : "Connect GitHub and Convex to get started. Expo is optional."}</p>
      {(["github", "convex", "expo"] as const).map((provider) => <section key={provider} className="space-y-3 rounded border p-4">
        <div><h2 className="font-semibold">{provider === "github" ? "GitHub" : provider === "convex" ? "Convex" : "Expo"} {provider === "expo" ? "(optional)" : "(required)"}</h2><p className="text-sm text-muted-foreground">{descriptions[provider]}</p></div>
        <p className="text-sm">{status[provider] ? `Connected: ${provider === "github" ? status.github?.owner : provider === "convex" ? status.convex?.name : status.expo?.name}` : "Not connected"}</p>
        {status[provider] ? <Button variant="outline" disabled={busy} onClick={() => void run(async () => { await disconnect({ provider }); })}>Disconnect</Button> : provider !== "expo" ? <Button disabled={busy || !status.available[provider]} onClick={() => void run(async () => { window.location.assign(await start({ provider })); })}>{returnedFromInstall && provider === "github" ? "Continue with GitHub" : `Connect ${provider === "github" ? "GitHub" : "Convex"}`}</Button> : <div className="space-y-3">
          <label className="block text-sm">Expo access token<Input type="password" autoComplete="off" value={token} onChange={(event) => { setToken(event.target.value); setAccounts([]); setAccountId(""); }} /></label>
          <Button variant="outline" disabled={busy || !token.trim() || !status.available.expo} onClick={() => void run(async () => { const result = await expoAccounts({ token }); setAccounts(result); setAccountId(result[0]?.id ?? ""); if (!result.length) setError("No Expo accounts found for this token."); })}>Validate token</Button>
          {accounts.length > 0 && <><label className="block text-sm">Expo account<select className="mt-1 block w-full rounded border bg-background p-2" value={accountId} onChange={(event) => setAccountId(event.target.value)}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><Button disabled={busy || !accountId} onClick={() => void run(async () => { await connectExpo({ token, accountId }); setToken(""); setAccounts([]); setAccountId(""); })}>Save Expo connection</Button></>}
        </div>}
        {!status.available[provider] && !status[provider] && <p className="text-sm">This connection is currently unavailable.</p>}
        {provider === "github" && installations.length > 0 && <div className="space-y-2"><p>Choose your GitHub installation:</p>{installations.map((installation) => <Button key={installation.installationId} variant="outline" disabled={busy || !proof} onClick={() => void run(async () => { if (!proof) return; await selectGithub({ proof, installationId: installation.installationId }); setInstallations([]); setProof(undefined); })}>{installation.owner}</Button>)}</div>}
        {provider === "github" && installNeeded && <div className="space-y-2"><p>No eligible installation found. Install Disposabl on your GitHub account, then connect again.</p>{status.githubInstallUrl && <a className="block underline" href={status.githubInstallUrl}>Install Disposabl</a>}</div>}
      </section>)}
    </>}
    {busy && <p role="status">Working…</p>}
    <Link to="/dashboard" className="inline-block underline">Skip and go to dashboard</Link>
  </main>;
}
