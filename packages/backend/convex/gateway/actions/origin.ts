/** Deployment credentials stay server-side; only the public origin is configured. */
export async function configurePublicOrigin(
  convexUrl: string,
  deployKey: string,
  publicSiteUrl: string,
) {
  const response = await fetch(
    `${convexUrl}/api/update_environment_variables`,
    {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Convex ${deployKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        changes: [{ name: "PUBLIC_SITE_URL", value: publicSiteUrl }],
      }),
    },
  );
  if (!response.ok)
    throw new Error("Could not configure the app's public URL. Retry setup.");
}
