import type { ActionCtx } from "../_generated/server";
import { env } from "../_generated/server";
import { internal } from "../_generated/api";
import { accessPrefix, digest } from "./access";
import { boat, sandboxRef } from "./boat";

export const agentEnvironment = () => ({
  DISPOSABL_API_ORIGIN: new URL(env.CONVEX_SITE_URL).origin,
  // Never inherit an operator's broad personal API key from the model environment.
  DISPOSABL_API_KEY: "",
});

export const appCredentialDirectory = (appId: string) =>
  `/home/user/.config/disposabl/apps/${appId}`;
export const credentialInstructions = (appId: string) =>
  `For every CLI/Git command in this app's turn, set DISPOSABL_API_KEY to an empty string, DISPOSABL_API_ORIGIN=${agentEnvironment().DISPOSABL_API_ORIGIN}, DISPOSABL_CONFIG_DIR=${appCredentialDirectory(appId)}, GH_CONFIG_DIR=${appCredentialDirectory(appId)}/github. Never use another app's credential files.\n`;

/** Reuse the CLI's private session file; credentials never enter prompts or stdout. */
export async function authorizeSandbox(
  ctx: ActionCtx,
  current: { userId: string; appId: string },
  lease: { id: string; token: string },
) {
  const token =
    accessPrefix +
    crypto.randomUUID().replaceAll("-", "") +
    crypto.randomUUID().replaceAll("-", "");
  const hash = await digest(token);
  const expiresAt = await ctx.runMutation(internal.agent.access.issue, {
    ...lease,
    userId: current.userId,
    appId: current.appId,
    hash,
  });
  const check = async () => {
    const identity = await ctx.runQuery(internal.agent.access.authenticate, {
      hash,
      worker: lease,
    });
    if (
      identity?.userId !== current.userId ||
      identity.appId !== current.appId ||
      identity.threadId !== lease.id
    )
      throw new Error(
        "Agent authorization ended before credential setup completed.",
      );
  };
  const ref = sandboxRef(current.userId);
  const directory = appCredentialDirectory(current.appId);
  const { DISPOSABL_API_ORIGIN: origin } = agentEnvironment();
  const path = `${directory}/${await digest(origin)}.json`;
  const temporary = `${path}.${crypto.randomUUID()}`;
  await check();
  const prepare = await boat.exec(ctx, {
    ...ref,
    command: `install -d -m 700 ${directory} /home/user/apps`,
    timeoutSeconds: 30,
  });
  if (prepare.exitCode !== 0 || prepare.timedOut)
    throw new Error("Could not prepare agent credentials.");
  await check();
  await boat.writeFile(ctx, {
    ...ref,
    path: temporary,
    content: JSON.stringify({
      tokens: { access_token: token, token_type: "Bearer", expires_in: 14_400 },
      expiresAt,
    }),
  });
  await check();
  const saved = await boat.exec(ctx, {
    ...ref,
    command: `chmod 600 ${temporary} && mv -f ${temporary} ${path}`,
    timeoutSeconds: 30,
  });
  if (saved.exitCode !== 0 || saved.timedOut)
    throw new Error("Could not save agent credentials.");
}
