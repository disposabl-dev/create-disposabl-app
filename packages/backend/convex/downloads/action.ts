"use node";

import { v } from "convex/values";
import { internalAction } from "@disposabl/disposabl-kit/server/lib/functions";
import { internal } from "../_generated/api";
import { githubRequest, githubToken } from "../github/actions/tokens";

const suffixes: Partial<Record<string, string[]>> = {
  android: [".apk"],
  ios: [".ipa"],
  macos: [".dmg"],
  windows: [".exe"],
  linux: [".AppImage", ".deb"],
};
type Candidate = {
  owner: string;
  repo: string;
  installationId: string;
  releaseUrl: string;
  artifactUrl: string;
  runId: number;
  attempt: number;
  commitSha: string;
  preview: boolean;
};
type Release = {
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  assets: {
    id: number;
    name: string;
    state: string;
    browser_download_url: string;
  }[];
};

export const resolve = internalAction({
  args: {
    appId: v.string(),
    platform: v.string(),
    userId: v.optional(v.string()),
    reference: v.optional(v.string()),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args): Promise<string | null> => {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        args.appId,
      ) ||
      !Object.hasOwn(suffixes, args.platform)
    )
      return null;
    const candidate: Candidate | null = await ctx.runQuery(
      internal.downloads.internal.candidate,
      args,
    );
    if (
      !candidate ||
      !/^[a-zA-Z0-9-]+$/.test(candidate.owner) ||
      !/^[a-zA-Z0-9_.-]+$/.test(candidate.repo)
    )
      return null;
    const repository = `${candidate.owner}/${candidate.repo}`;
    const prefix = `https://github.com/${repository}/releases/tag/`;
    if (!candidate.releaseUrl.startsWith(prefix)) return null;
    const encodedTag = candidate.releaseUrl.slice(prefix.length);
    if (!encodedTag || /[?#]/.test(encodedTag)) return null;
    let tag: string;
    try {
      tag = decodeURIComponent(encodedTag);
    } catch {
      return null;
    }
    if (
      candidate.preview
        ? !new RegExp(`^app-pr-[1-9][0-9]*-${args.platform}$`).test(tag)
        : tag !==
          `app-production-${args.platform}-${candidate.runId}-${candidate.attempt}`
    )
      return null;
    const token = await githubToken(
      ctx,
      candidate.installationId,
      ["contents:read"],
      repository,
    );
    const release = await githubRequest<Release>(
      token,
      `/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`,
    );
    if (
      release.html_url !== candidate.releaseUrl ||
      release.draft !== false ||
      release.prerelease !== candidate.preview ||
      !release.published_at ||
      !Array.isArray(release.assets)
    )
      return null;
    const asset = release.assets.find(
      (a) =>
        a.browser_download_url === candidate.artifactUrl &&
        a.state === "uploaded" &&
        suffixes[args.platform]?.some((s) => a.name.endsWith(s)) &&
        Number.isSafeInteger(a.id) &&
        a.id > 0,
    );
    if (!asset) return null;
    // PR tags are reused. Reject an asset from a newer publication until its
    // matching workflow result has reached the selected preview record.
    if (candidate.preview) {
      const ref = await githubRequest<{
        object: { type: string; sha: string };
      }>(token, `/repos/${repository}/git/ref/tags/${encodeURIComponent(tag)}`);
      if (
        ref.object.type !== "commit" ||
        ref.object.sha !== candidate.commitSha
      )
        return null;
    }
    const response = await fetch(
      `https://api.github.com/repos/${repository}/releases/assets/${asset.id}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/octet-stream",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (response.status !== 302) {
      await response.body?.cancel();
      return null;
    }
    const location = response.headers.get("location");
    if (!location) return null;
    const url = new URL(location);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      ![
        "release-assets.githubusercontent.com",
        "objects.githubusercontent.com",
      ].includes(url.hostname)
    )
      return null;
    const current: Candidate | null = await ctx.runQuery(
      internal.downloads.internal.candidate,
      args,
    );
    return JSON.stringify(current) === JSON.stringify(candidate)
      ? url.href
      : null;
  },
});
