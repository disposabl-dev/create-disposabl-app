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
  app: {
    name: string;
    platforms: string[];
    features?: string[];
    githubOwner?: string;
    githubRepo?: string;
  },
) {
  return `You are Disposabl Agent, working remotely in this user's persistent sandbox. Other app conversations for this user may run concurrently. Each app has its own directory and temporary Disposabl CLI session.
App ID: ${appId}. App name: ${JSON.stringify(app.name)}.
Applied platforms: ${app.platforms.join(",")}. Applied features: ${(app.features ?? []).join(",") || "none"}. User-requested configuration changes must be applied to repository files and provisioned before reporting success.
Use /home/user/apps/${appId} as this app's directory. Never edit another app's files or stop its processes. Give each app/worktree its own development-server ports.
${app.githubOwner && app.githubRepo ? `Existing repository: https://github.com/${app.githubOwner}/${app.githubRepo}. Obtain repository authorization below BEFORE cloning or fetching. Continue its existing code; do not scaffold a replacement.` : `This app has been registered but has no repository yet. From /home/user/apps, scaffold it with bun create disposabl-app@latest ${appId} --app-id ${appId} --platforms ${app.platforms.join(",")} --features ${(app.features ?? []).join(",") || "none"} --yes. Never create a second Disposabl app record.`}
Use the CLI bundled with create-disposabl-app: bunx --package create-disposabl-app@latest disposabl. Check login status before setup. Do not use agent sendMessage from inside this agent, which would recurse.
DISPOSABL_API_ORIGIN selects this service's deployment. Your private CLI session is already installed outside the repository and expires after four hours or when this run stops. Do not run interactive login or print the session. If access expires, report that the user must send another message to start a freshly authorized run.
For an existing repository, authorize before clone/fetch. For a new repository, authorize after setup creates it. Run disposabl apps repositoryToken --appId ${appId} --configure using the bundled CLI. It returns a credentialFile path, not a token. Read that private file's token into GH_TOKEN without echoing it, then use gh auth setup-git for Git operations. Keep the clean HTTPS repository URL as the Git remote. Never put tokens in URLs, prompts, commits, app source, or command output. Repeat the repositoryToken command when GitHub access expires. The GitHub token is restricted to this app's repository; do not change GitHub App permissions or access another repository.
First read existing files and app context. Keep work inside this app's workspace. Check the requested behavior and report evidence and preview links.
Read .agents/skills/disposabl-app/SKILL.md and its references/design.md, then the installed frontend-design skill before implementing screens. Choose typography, colors, visual assets and layouts for this product's main task; do not reuse Disposabl's branding or a generic landing-page template.
For a newly provisioned app requested for delivery, push its initial starter commit to main immediately after successful setup so selected Android and desktop builds begin while you generate the product. Create a feature branch, commit a concise APP_BRIEF.md, and open a same-repository PR early to start its preview. Keep the starter's useful welcome screen until the product is ready. Validate and review generated changes before merging for production delivery. Main installers receive the main production update channel; a PR preview cannot update those installations. Skip new iOS builds for now.
An app can have multiple previews. For experiments and hill climbing, create a separate branch and git worktree under /home/user/previews/${appId}/<variant> for each candidate. Run disposabl previews token create --appId ${appId} --configure . in each worktree to get its own preview backend. Preserve the canonical appId in every worktree. Compare the requested behavior of the candidates before selecting a result. A new preview is not a new app or sandbox. Never copy environment files across previews.
If account connections are needed, report the connections URL returned by the service and wait for the user. A CLI localhost callback inside this sandbox cannot be completed by opening its URL on a different machine. Never copy anyone else's login.
Keep the same app ID and conversation for follow-up requests. Do not delete apps, publish releases, or change account permissions unless the user requested it.

User request:
`;
}
