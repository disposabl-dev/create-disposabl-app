export class ManagementError extends Error {
  constructor(readonly status: number) {
    super(`Convex management request failed (${status}).`);
  }
}
export async function management<T>(
  token: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`https://api.convex.dev/v1${path}`, {
    method: body === undefined ? "GET" : "POST",
    redirect: "error",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new ManagementError(response.status);
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
/** Recover a project after a lost create response; names include the immutable app UUID. */
export async function ensureProject(
  token: string,
  teamId: string,
  appId: string,
) {
  const name = `disposabl-${appId}`;
  const lookup = async () => {
    const result = await management<{ items: { id: number; name: string }[] }>(
      token,
      `/teams/${teamId}/projects?q=${encodeURIComponent(name)}&limit=100`,
    );
    const matches = result.items.filter((project) => project.name === name);
    if (matches.length > 1)
      throw new Error(
        "Multiple Convex projects match this app. Reconcile before retrying.",
      );
    return matches[0];
  };
  const existing = await lookup();
  if (existing) return existing.id;
  try {
    return (
      await management<{ id: number }>(
        token,
        `/teams/${teamId}/create_project`,
        { projectName: name },
      )
    ).id;
  } catch (error) {
    const recovered = await lookup();
    if (recovered) return recovered.id;
    throw error;
  }
}
type Deployment = {
  name: string;
  projectId: number;
  deploymentType: string;
  kind: string;
  reference: string;
  deploymentUrl: string;
};
export async function ensureDevelopment(
  token: string,
  projectId: number,
  reference: string,
) {
  const path = `/projects/${projectId}`;
  const lookup = () =>
    management<Deployment>(
      token,
      `${path}/deployment?reference=${encodeURIComponent(reference)}`,
    );
  let deployment: Deployment;
  try {
    deployment = await lookup();
  } catch (error) {
    if (!(error instanceof ManagementError) || error.status !== 404)
      throw error;
    try {
      deployment = await management<Deployment>(
        token,
        `${path}/create_deployment`,
        { type: "dev", reference, isDefault: false },
      );
    } catch (error) {
      try {
        deployment = await lookup();
      } catch {
        throw error;
      }
    }
  }
  if (
    deployment.kind !== "cloud" ||
    deployment.deploymentType !== "dev" ||
    deployment.projectId !== projectId ||
    deployment.reference !== reference
  )
    throw new Error("Expected this app's named development deployment.");
  const url = new URL(deployment.deploymentUrl);
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".convex.cloud") ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("Unexpected Convex deployment URL.");
  const convexUrl = url.origin;
  const convexSiteUrl = convexUrl.replace(/\.convex\.cloud$/, ".convex.site");
  const { deployKey } = await management<{ deployKey: string }>(
    token,
    `/deployments/${encodeURIComponent(deployment.name)}/create_deploy_key`,
    { name: `disposabl-${reference}` },
  );
  if (!deployKey.startsWith(`dev:${deployment.name}|`))
    throw new Error("Expected a development-scoped key.");
  return {
    name: deployment.name,
    reference,
    convexUrl,
    convexSiteUrl,
    deployKey,
  };
}

export async function ensureProduction(token: string, projectId: number) {
  const path = `/projects/${projectId}`;
  const lookup = () =>
    management<Deployment>(token, `${path}/deployment?defaultProd=true`);
  let deployment: Deployment;
  try {
    deployment = await lookup();
  } catch (error) {
    if (!(error instanceof ManagementError) || error.status !== 404)
      throw error;
    try {
      deployment = await management<Deployment>(
        token,
        `${path}/create_deployment`,
        { type: "prod" },
      );
    } catch (error) {
      try {
        deployment = await lookup();
      } catch {
        throw error;
      }
    }
  }
  if (
    deployment.kind !== "cloud" ||
    deployment.deploymentType !== "prod" ||
    deployment.projectId !== projectId
  )
    throw new Error("Expected this app's production deployment.");
  return deployment.name;
}
