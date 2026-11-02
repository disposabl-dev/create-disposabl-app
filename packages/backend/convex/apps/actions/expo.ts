"use node";

import { ConvexError } from "convex/values";

type Project = {
  id: string;
  slug: string;
  ownerAccount: { id: string; name: string };
};
type Receipt = { id: string; state: string; willRetry: boolean };
const fields = "id slug ownerAccount { id name }";
export async function expoRequest<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await fetch("https://api.expo.dev/graphql", {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok)
    throw new ConvexError(`Expo request failed (${response.status}).`);
  const result = (await response.json()) as {
    data?: T;
    errors?: { message?: string; extensions?: { errorCode?: string } }[];
  };
  if (
    result.errors?.some(
      (error) =>
        error.extensions?.errorCode === "SUDO_MODE_REQUIRED" ||
        error.message ===
          "Only regular user and SSO user access to this API is supported",
    )
  )
    throw new ExpoLoginRequired();
  if (result.errors?.length) {
    if (
      result.errors.every(
        (error) => error.extensions?.errorCode === "EXPERIENCE_NOT_FOUND",
      )
    )
      throw new ExpoNotFound();
    throw new ConvexError(
      "Expo could not complete this request. Check your token and project permissions.",
    );
  }
  if (!result.data) throw new ConvexError("Expo returned no project details.");
  return result.data;
}
export class ExpoLoginRequired extends Error {}
class ExpoNotFound extends Error {}
export async function findExpo(
  token: string,
  fullName: string,
  projectId?: string,
) {
  try {
    const data = projectId
      ? await expoRequest<{ app: { project: Project } }>(
          token,
          `query($id: String!) { app { project: byId(appId: $id) { ${fields} } } }`,
          { id: projectId },
        )
      : await expoRequest<{ app: { project: Project } }>(
          token,
          `query($name: String!) { app { project: byFullName(fullName: $name) { ${fields} } } }`,
          { name: fullName },
        );
    if (!data.app.project)
      throw new ConvexError("Expo returned no project details.");
    return data.app.project;
  } catch (error) {
    if (error instanceof ExpoNotFound) return null;
    throw error;
  }
}
export function verifyExpo(project: Project, accountId: string, appId: string) {
  if (project.ownerAccount.id !== accountId || project.slug !== `app-${appId}`)
    throw new ConvexError(
      "Reconnect the Expo account that owns this app. The linked project must match this app's UUID.",
    );
}
export async function ensureExpo(
  token: string,
  accountId: string,
  owner: string,
  appId: string,
  saved?: string,
) {
  const fullName = `@${owner}/app-${appId}`;
  let project = await findExpo(token, fullName, saved);
  if (!project) {
    if (saved)
      throw new ConvexError(
        "The linked Expo project is unavailable. Reconnect its owner before continuing.",
      );
    try {
      const created = await expoRequest<{ app: { createApp: { id: string } } }>(
        token,
        "mutation($input: AppInput!) { app { createApp(appInput: $input) { id } } }",
        { input: { accountId, projectName: `app-${appId}` } },
      );
      project = await findExpo(token, fullName, created.app.createApp.id);
    } catch (error) {
      project = await findExpo(token, fullName);
      if (!project) throw error;
    }
  }
  if (!project)
    throw new ConvexError("Expo project creation is incomplete. Retry setup.");
  verifyExpo(project, accountId, appId);
  return project;
}
export async function deleteExpo(
  token: string,
  projectId: string,
  savedReceipt: string | undefined,
  saveReceipt: (id: string) => Promise<void>,
) {
  let receipt: Receipt;
  if (savedReceipt) {
    const data = await expoRequest<{
      backgroundJobReceipt: { byId: Receipt | null };
    }>(
      token,
      "query($id: ID!) { backgroundJobReceipt { byId(id: $id) { id state willRetry } } }",
      { id: savedReceipt },
    );
    if (!data.backgroundJobReceipt.byId)
      throw new ConvexError(
        "Expo deletion receipt is unavailable. Reconnect the owning account.",
      );
    receipt = data.backgroundJobReceipt.byId;
  } else {
    receipt = (
      await expoRequest<{ app: { scheduleAppDeletion: Receipt } }>(
        token,
        "mutation($id: ID!) { app { scheduleAppDeletion(appId: $id) { id state willRetry } } }",
        { id: projectId },
      )
    ).app.scheduleAppDeletion;
    await saveReceipt(receipt.id);
  }
  const deadline = Date.now() + 90_000;
  while (receipt.state !== "SUCCESS") {
    if (receipt.state === "FAILURE" && !receipt.willRetry)
      throw new ConvexError(
        "Expo project deletion failed. Check your Expo account and retry apps delete.",
      );
    if (Date.now() >= deadline)
      throw new ConvexError(
        "Expo is still deleting the project. Retry apps delete to finish cleanup.",
      );
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const data = await expoRequest<{
      backgroundJobReceipt: { byId: Receipt | null };
    }>(
      token,
      "query($id: ID!) { backgroundJobReceipt { byId(id: $id) { id state willRetry } } }",
      { id: receipt.id },
    );
    if (!data.backgroundJobReceipt.byId)
      throw new ConvexError(
        "Expo deletion could not be confirmed. Retry apps delete.",
      );
    receipt = data.backgroundJobReceipt.byId;
  }
}
