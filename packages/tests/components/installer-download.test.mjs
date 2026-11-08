import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { getFunctionName } from "convex/server";

const appId = "12ab3456-1234-4234-8234-123456789abc";
const repository = "owner/private-app";
const sha = "a".repeat(40);
const base = `https://github.com/${repository}/releases`;
const signedUrl =
  "https://release-assets.githubusercontent.com/fixture?sig=short-lived";
let userId,
  tables,
  release,
  tagSha,
  location,
  requestCalls,
  queryCalls,
  afterLookup,
  githubResponse,
  expectedPermissions;
const originalFetch = globalThis.fetch;
mock.module("@convex-dev/auth/server", () => ({
  getAuthUserId: async (ctx) => ctx.userId ?? null,
}));
const token = mock(async (_ctx, installation, permissions, repo) => {
  expect(installation).toBe("123");
  expect(permissions).toEqual(expectedPermissions);
  expect(repo).toBe(repository);
  return "server-only-token";
});
mock.module("../../backend/convex/github/actions/tokens", () => ({
  githubToken: token,
  githubRequest: async (secret, path) => {
    expect(secret).toBe("server-only-token");
    requestCalls.push(path);
    if (githubResponse) return githubResponse(path);
    if (path.includes("/git/ref/"))
      return { object: { type: "commit", sha: tagSha } };
    return release;
  },
}));
const { candidate } = await import("../../backend/convex/downloads/internal");
const { resolve } = await import("../../backend/convex/downloads/action");
const { installer } = await import("../../backend/convex/downloads/index");
const { download } = await import("../../backend/convex/downloads/http");
const ctx = {
  get userId() {
    return userId;
  },
  auth: {},
  db: {
    query: (table) => ({
      withIndex: (_index, filter) => {
        const matches = [];
        const q = {
          eq: (key, value) => {
            matches.push([key, value]);
            return q;
          },
        };
        filter(q);
        return {
          unique: async () =>
            tables[table]?.find((row) =>
              matches.every(([key, value]) => row[key] === value),
            ) ?? null,
        };
      },
    }),
  },
  runQuery: async (fn, args) => {
    expect(getFunctionName(fn)).toBe("downloads/internal:candidate");
    const result = await candidate._handler(ctx, args);
    queryCalls++;
    afterLookup?.();
    return result;
  },
  runAction: async (fn, args) => {
    expect(getFunctionName(fn)).toBe("downloads/action:resolve");
    return resolve._handler(ctx, args);
  },
};
const args = { appId, platform: "android", reference: "feature/habits" };
beforeEach(() => {
  userId = "owner-user";
  tagSha = sha;
  location = signedUrl;
  queryCalls = 0;
  requestCalls = [];
  afterLookup = undefined;
  githubResponse = undefined;
  expectedPermissions = ["contents:read"];
  token.mockClear();
  const latest = {
    status: "ready",
    artifactId: 12,
    githubReleaseUrl: `${base}/tag/app-pr-7-android`,
    artifactUrl: `${base}/download/app-pr-7-android/android.apk`,
    run: {
      id: 101,
      attempt: 2,
      number: 3,
      commitSha: sha,
      url: `https://github.com/${repository}/actions/runs/101`,
    },
  };
  tables = {
    apps: [
      {
        appId,
        userId,
        githubOwner: "owner",
        githubRepo: "private-app",
        platforms: ["android"],
      },
    ],
    previews: [
      { appId, reference: args.reference, releases: { android: latest } },
    ],
    appReleases: [],
    githubConnections: [{ userId, owner: "owner", installationId: "123" }],
  };
  release = {
    html_url: latest.githubReleaseUrl,
    draft: false,
    prerelease: true,
    published_at: "2026-11-08",
    assets: [
      {
        id: 12,
        name: "android.apk",
        state: "uploaded",
        browser_download_url: latest.artifactUrl,
      },
    ],
  };
  globalThis.fetch = mock(async (url, init) => {
    expect(url).toBe(
      `https://api.github.com/repos/${repository}/releases/assets/12`,
    );
    expect(init.redirect).toBe("manual");
    expect(init.headers.Authorization).toBe("Bearer server-only-token");
    return new Response(null, { status: 302, headers: { location } });
  });
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("owner resolves the selected private branch without exposing the installation token", async () => {
  expect(await installer._handler(ctx, args)).toBe(signedUrl);
  expect(token).toHaveBeenCalledTimes(1);
  expect(queryCalls).toBe(2);
});

test("anonymous and different owners cannot request private or production installers", async () => {
  userId = undefined;
  await expect(installer._handler(ctx, args)).rejects.toThrow("Sign in");
  userId = "someone-else";
  expect(await installer._handler(ctx, args)).toBeNull();
  expect(
    await installer._handler(ctx, { appId, platform: "android" }),
  ).toBeNull();
  expect(token).not.toHaveBeenCalled();
});

test("public HTTP downloads never select private preview records", async () => {
  const response = await download._handler(
    ctx,
    new Request(
      `https://fixture.convex.site/downloads/${appId}/android?reference=feature/habits`,
    ),
  );
  expect(response.status).toBe(404);
  expect(token).not.toHaveBeenCalled();
  expect(await candidate._handler(ctx, args)).toBeNull();
});

test("missing branches, disabled platforms, failed builds and deleting apps fail before credentials", async () => {
  expect(
    await installer._handler(ctx, { ...args, reference: "another-branch" }),
  ).toBeNull();
  tables.previews[0].releases.android.status = "failed";
  expect(await installer._handler(ctx, args)).toBeNull();
  tables.previews[0].releases.android.status = "ready";
  tables.apps[0].platforms = [];
  expect(await installer._handler(ctx, args)).toBeNull();
  tables.apps[0].platforms = ["android"];
  tables.apps[0].operation = { kind: "delete", until: Date.now() + 10_000 };
  expect(await installer._handler(ctx, args)).toBeNull();
  expect(token).not.toHaveBeenCalled();
});

test.each([
  "repository",
  "tag",
  "draft",
  "prerelease",
  "asset",
  "commit",
  "replacement asset",
  "redirect",
])("rejects a mismatched %s", async (fault) => {
  if (fault === "repository")
    tables.previews[0].releases.android.githubReleaseUrl =
      "https://github.com/other/repo/releases/tag/app-pr-7-android";
  if (fault === "tag")
    tables.previews[0].releases.android.githubReleaseUrl = `${base}/tag/app-production-android-101-2`;
  if (fault === "draft") release.draft = true;
  if (fault === "prerelease") release.prerelease = false;
  if (fault === "asset")
    release.assets[0].browser_download_url = `${base}/download/app-pr-8-android/android.apk`;
  if (fault === "commit") tagSha = "b".repeat(40);
  // New bytes can exist under the old URL before the publisher moves the tag.
  if (fault === "replacement asset") release.assets[0].id = 13;
  if (fault === "redirect") location = "https://attacker.example/file.apk";
  expect(await installer._handler(ctx, args)).toBeNull();
});

test("does not return a link when ownership or build changes while resolving", async () => {
  afterLookup = () => {
    tables.apps[0].userId = "new-owner";
  };
  expect(await installer._handler(ctx, args)).toBeNull();
  tables.apps[0].userId = userId;
  afterLookup = () => {
    tables.previews[0].releases.android = {
      ...tables.previews[0].releases.android,
      status: "building",
    };
  };
  expect(await installer._handler(ctx, args)).toBeNull();
});

test("production retains its existing public download route and immutable run tag", async () => {
  const latest = tables.previews[0].releases.android;
  latest.githubReleaseUrl = `${base}/tag/app-production-android-101-2`;
  latest.artifactUrl = `${base}/download/app-production-android-101-2/android.apk`;
  tables.appReleases = [{ appId, releases: { android: latest } }];
  release.html_url = latest.githubReleaseUrl;
  release.assets[0].browser_download_url = latest.artifactUrl;
  release.prerelease = false;
  userId = undefined;
  const response = await download._handler(
    ctx,
    new Request(`https://fixture.convex.site/downloads/${appId}/android`),
  );
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(signedUrl);
  expect(response.headers.get("cache-control")).toBe("no-store");
});

// Exercise the real button independently of native rendering and provider calls.
const { createElement } = await import("react");
const { act, create } = await import("react-test-renderer");
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let session = "session-a",
  finish,
  renderer;
const resolveInstaller = mock(
  () =>
    new Promise((resolve) => {
      finish = resolve;
    }),
);
const openURL = mock(async () => {});
mock.module("@convex-dev/auth/react", () => ({
  useAuthToken: () =>
    `header.${btoa(JSON.stringify({ sub: session }))}.signature`,
}));
mock.module("convex/react", () => ({ useAction: () => resolveInstaller }));
mock.module("react-native", () => ({
  View: "View",
  Text: "Text",
  Linking: { openURL },
}));
mock.module("../../../apps/mobile/src/features/management/ui", () => ({
  Button: "Button",
  useStyles: () => ({ text: {} }),
}));
const { InstallerButton } =
  await import("../../../apps/mobile/src/features/management/installer-button");
const buttonProps = { ...args, releaseKey: "run101-attempt2" };
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = undefined;
  session = "session-a";
  openURL.mockClear();
  resolveInstaller.mockClear();
});
async function mount() {
  await act(async () => {
    renderer = create(createElement(InstallerButton, buttonProps));
  });
}
test("mobile download requests the selected preview, prevents repeat taps and opens the returned installer", async () => {
  await mount();
  const press = renderer.root.findByType("Button").props.onPress;
  await act(async () => {
    press();
    press();
  });
  expect(resolveInstaller).toHaveBeenCalledTimes(1);
  expect(resolveInstaller).toHaveBeenCalledWith(args);
  expect(renderer.root.findByType("Button").props.disabled).toBe(true);
  await act(async () => {
    finish(signedUrl);
  });
  expect(openURL).toHaveBeenCalledWith(signedUrl);
  expect(renderer.root.findByType("Button").props.disabled).toBe(false);
});
test.each(["session", "release", "unmount"])(
  "mobile ignores late results after %s changes",
  async (change) => {
    await mount();
    await act(async () => renderer.root.findByType("Button").props.onPress());
    await act(async () => {
      if (change === "unmount") renderer.unmount();
      else {
        if (change === "session") session = "session-b";
        renderer.update(
          createElement(InstallerButton, {
            ...buttonProps,
            ...(change === "release" ? { releaseKey: "run102" } : {}),
          }),
        );
      }
    });
    await act(async () => {
      finish(signedUrl);
    });
    expect(openURL).not.toHaveBeenCalled();
  },
);
test("mobile presents retry guidance when opening the installer fails", async () => {
  openURL.mockRejectedValueOnce(new Error("private diagnostic"));
  await mount();
  await act(async () => renderer.root.findByType("Button").props.onPress());
  await act(async () => {
    finish(signedUrl);
  });
  expect(renderer.root.findByType("Text").props.children).toBe(
    "Could not open the installer. Please try again.",
  );
  expect(renderer.root.findByType("Button").props.disabled).toBe(false);
});

mock.module("../../backend/convex/github/actions/oidc", () => ({
  verifyGitHubToken: async () => ({
    event_name: "push",
    ref: "refs/heads/main",
    repository_id: "55",
    run_id: "101",
    run_attempt: "2",
  }),
  workflowRepository: () => repository,
}));
const { report } = await import("../../backend/convex/github/actions/internal");
test("release reporting records the verified asset ID and rejects replacement races", async () => {
  release.body = `Platform: android\nSource: ${sha}\n<!-- android ${JSON.stringify({ sha256: "a".repeat(64) })} -->\n`;
  release.assets[0].digest = `sha256:${"a".repeat(64)}`;
  expectedPermissions = [
    "contents:write",
    "actions:read",
    "pull_requests:read",
  ];
  githubResponse = (path) => {
    if (path === `/repos/${repository}`) return { id: 55 };
    if (path.includes("/actions/runs/"))
      return {
        id: 101,
        run_attempt: 2,
        run_number: 3,
        head_sha: sha,
        head_branch: "main",
        event: "push",
        html_url: `https://github.com/${repository}/actions/runs/101`,
        path: ".github/workflows/pipeline.yml",
        repository: { id: 55 },
        head_repository: { id: 55 },
      };
    return release;
  };
  const mutations = [];
  const reportCtx = {
    runQuery: async () => ({ ...tables.apps[0], installationId: "123" }),
    runMutation: async (fn, value) => {
      if (getFunctionName(fn) === "previews/internal:report")
        mutations.push(value);
      return null;
    },
  };
  const request = {
    appId,
    token: "fixture-oidc",
    platform: "android",
    status: "ready",
    githubReleaseUrl: release.html_url,
    artifactUrl: release.assets[0].browser_download_url,
  };
  await report._handler(reportCtx, request);
  expect(mutations[0].artifactId).toBe(12);
  // A late report for A must not record the replacement B asset before B's
  // release notes and tag have advanced, even though the URL is unchanged.
  release.assets[0].id = 13;
  release.assets[0].digest = `sha256:${"b".repeat(64)}`;
  await expect(report._handler(reportCtx, request)).rejects.toThrow("manifest");
  release.assets[0].id = 0;
  await expect(report._handler(reportCtx, request)).rejects.toThrow(
    "not published",
  );
  release.assets[0].id = 12;
  release.assets[0].digest = `sha256:${"a".repeat(64)}`;
  release.body = release.body.replace(
    `Source: ${sha}`,
    `Source: ${"b".repeat(40)}`,
  );
  await expect(report._handler(reportCtx, request)).rejects.toThrow("source");
  expect(mutations).toHaveLength(1);
});

test("mobile shows retry guidance for an unavailable installer without a rejected action", async () => {
  await mount();
  await act(async () => renderer.root.findByType("Button").props.onPress());
  await act(async () => {
    finish(null);
  });
  expect(openURL).not.toHaveBeenCalled();
  expect(renderer.root.findByType("Text").props.children).toBe(
    "Could not open the installer. Please try again.",
  );
  expect(renderer.root.findByType("Button").props.disabled).toBe(false);
});
