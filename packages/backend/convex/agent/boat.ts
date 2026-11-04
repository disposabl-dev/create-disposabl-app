import { Boat } from "@boatdev/convex";
import { components } from "../_generated/api";
import { env } from "../_generated/server";

export const boat = new Boat(components.boat);
export const sandboxRef = (userId: string) => ({
  ownerId: userId,
  key: "workspace",
});
export class BoatError extends Error {
  constructor(
    public status: number,
    public code: string,
    public reason?: string,
  ) {
    super(`Boat ${code} (${status})${reason ? `: ${reason}` : ""}`);
  }
}
export function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
// The published component does not yet expose steer or interrupt.
export async function request(
  sandboxId: string,
  path: string,
  body?: object,
  method: "GET" | "POST" = "POST",
) {
  const response = await fetch(
    `https://boat.dev/api/v1/sandboxes/${encodeURIComponent(sandboxId)}${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${env.BOAT_API_KEY}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30_000),
      redirect: "error",
    },
  );
  const data = object(await response.json());
  if (!response.ok) {
    const error = object(data.error);
    throw new BoatError(
      response.status,
      typeof data.code === "string"
        ? data.code
        : typeof error.code === "string"
          ? error.code
          : "request_failed",
      typeof object(error.details).reason === "string"
        ? String(object(error.details).reason)
        : undefined,
    );
  }
  return data;
}

export function instructions(
  appId: string,
  app: { name: string; githubOwner?: string; githubRepo?: string },
) {
  return `You are Disposabl Agent, working remotely in this user's persistent sandbox. This sandbox is shared by all of this user's apps. Other app conversations can be running at the same time.
App ID: ${appId}. App name: ${JSON.stringify(app.name)}.
Use /home/user/apps/${appId} as this app's directory. Never edit another app's files or stop its processes. Give each app/worktree its own development-server ports.
${app.githubOwner && app.githubRepo ? `Existing repository: https://github.com/${app.githubOwner}/${app.githubRepo}. Clone it and continue its code; do not scaffold a replacement.` : `This app has been registered but has no repository yet. Scaffold it in this sandbox with bun create disposabl-app@latest my-app --app-id ${appId} --yes and the requested --platforms and --features. Never create a second Disposabl app record.`}
Use @disposabl/cli@latest to manage this app and its previews. Use bunx @disposabl/cli@latest login status before setup. Do not use agent sendMessage from inside this agent, which would recurse.
First read existing files and app context. Keep work inside this app's workspace. Check the requested behavior and report evidence and preview links.
An app can have multiple previews. For experiments and hill climbing, create a separate branch and git worktree under /home/user/previews/${appId}/<variant> for each candidate. Run disposabl previews token create --appId ${appId} --configure . in each worktree to get its own preview backend. Preserve the canonical appId in every worktree. Compare the requested behavior of the candidates before selecting a result. A new preview is not a new app or sandbox. Never copy environment files across previews.
If Disposabl login or account connections are needed, explain the exact step and stop to wait for the user. Connections can be completed at https://www.disposabl.dev/dashboard/connections on the user's own machine. A CLI localhost callback inside this sandbox cannot be completed by opening its URL on a different machine. Never claim that works. Remote login handoff and desktop streaming are not implemented yet. Do not print credentials or copy anyone else's login.
Keep the same app ID and conversation for follow-up requests. Do not delete apps, publish releases, or change account permissions unless the user requested it.

User request:
`;
}
