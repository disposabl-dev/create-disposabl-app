import { appendFile, readFile } from "node:fs/promises";

const origin = "https://www.disposabl.dev";
const config = JSON.parse(await readFile("disposabl.json", "utf8"));
const [command, platform, status, detail] = process.argv.slice(2);
if (config.appId) {
  const audience = new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
  // The audience is an identity identifier, independent of the HTTP hostname.
  audience.searchParams.set("audience", "https://disposabl.dev");
  const identity = await fetch(audience, {
    headers: {
      Authorization: `Bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`,
    },
  });
  if (!identity.ok)
    throw new Error(`GitHub identity failed (${identity.status}).`);
  const { value: token } = await identity.json();
  const call = async (path, body) => {
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(origin + path, {
        method: "POST",
        redirect: "error",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ appId: config.appId, ...body }),
        signal: AbortSignal.timeout(90_000),
      });
      if (response.ok) return response.json();
      const delay = Number(response.headers.get("retry-after") || 5);
      if (
        ![429, 502, 503, 504].includes(response.status) ||
        attempt >= 5 ||
        !Number.isFinite(delay) ||
        delay > 60
      )
        throw new Error(
          `Disposabl ${path} failed (${response.status}).${response.headers.has("retry-after") ? ` Retry after ${delay}s.` : ""}`,
        );
      console.log(
        `Disposabl connection is busy; retrying in ${Math.max(1, delay)}s.`,
      );
      await response.body?.cancel();
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(1, delay) * 1000),
      );
    }
  };
  if (command === "token") {
    const result = await call("/github/token", {});
    console.log(`::add-mask::${result.token}`);
    await appendFile(process.env.GITHUB_ENV, `GH_TOKEN=${result.token}\n`);
  } else if (command === "report") {
    for (const name of platform
      .split(",")
      .filter((name) => config.platforms.includes(name))) {
      const routes = { web: "", api: "/openapi.json", mcp: "/mcp" };
      const url =
        status === "ready" &&
        Object.hasOwn(routes, name) &&
        process.env.CONVEX_SITE_URL
          ? process.env.CONVEX_SITE_URL + routes[name]
          : undefined;
      await call("/github/report", {
        platform: name,
        status,
        ...(detail ? { reason: detail } : {}),
        ...(url ? { url } : {}),
        ...(process.env.PUBLISHED_VERSION
          ? { version: process.env.PUBLISHED_VERSION }
          : {}),
      });
    }
  } else if (command === "release" && config.platforms.includes(platform)) {
    const response = await fetch(
      `https://api.github.com/repos/${process.env.GH_REPO}/releases/tags/${encodeURIComponent(status)}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.GH_TOKEN}`,
          Accept: "application/vnd.github+json",
        },
      },
    );
    if (!response.ok)
      throw new Error(`Cannot inspect release (${response.status}).`);
    const release = await response.json();
    const updateOnly = /"action"\s*:\s*"update"/.test(release.body ?? "");
    if (updateOnly) {
      await call("/github/report", { platform, status: "ready" });
      process.exit(0);
    }
    const suffix = {
      android: ".apk",
      ios: ".ipa",
      macos: ".dmg",
      windows: ".exe",
      linux: ".AppImage",
    }[platform];
    const asset =
      release.assets.find((asset) => asset.name.endsWith(suffix)) ??
      (platform === "linux"
        ? release.assets.find((asset) => asset.name.endsWith(".deb"))
        : undefined);
    await call("/github/report", {
      platform,
      status: "ready",
      version: process.env.DISPOSABL_RELEASE_VERSION,
      githubReleaseUrl: release.html_url,
      ...(asset ? { artifactUrl: asset.browser_download_url } : {}),
    });
  }
}
