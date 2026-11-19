import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import { createAppleClient } from "./apple-api.mjs";
import { submitPlayReview } from "./play-review.mjs";

const directory = await realpath(".disposabl/store");
if (directory !== resolve(".disposabl/store"))
  throw new Error("Store metadata directory must be inside the checkout.");
const manifest = JSON.parse(
  await readFile(resolve(directory, "release.json"), "utf8"),
);
const { expo } = JSON.parse(await readFile("apps/mobile/app.json", "utf8"));
const [platform] = process.argv.slice(2);
if (!["ios", "android"].includes(platform) || !manifest[platform])
  throw new Error("Add release metadata for the selected platform.");
const target = manifest[platform];
const relation = (type, id) => ({ data: { type, id } });
if (
  target.screenshots &&
  (!Array.isArray(target.screenshots) || target.screenshots.length > 20)
)
  throw new Error("Choose up to 20 screenshots for this submission.");

async function safeScreenshot(path) {
  if (typeof path !== "string" || !/^[a-zA-Z0-9_/-]+\.png$/.test(path))
    throw new Error("Screenshot paths must name PNGs inside .disposabl/store.");
  const filename = await realpath(resolve(directory, path));
  if (!filename.startsWith(directory + sep))
    throw new Error("Screenshot file is outside .disposabl/store.");
  const file = await stat(filename);
  if (!file.isFile() || file.size <= 0 || file.size > 10 * 1024 * 1024)
    throw new Error("Use PNG files of at most 10 MB.");
  return filename;
}

if (platform === "android") {
  const screenshots = await Promise.all(
    (target.screenshots ?? []).map(async (screenshot) => ({
      ...screenshot,
      path: await safeScreenshot(screenshot.path),
    })),
  );
  let account;
  try {
    account = JSON.parse(process.env.ANDROID_PLAY_SERVICE_ACCOUNT ?? "{}");
  } catch {
    throw new Error(
      "Configure a valid Google Play service account in the repository secret.",
    );
  }
  const result = await submitPlayReview({
    packageName: expo.android.package,
    track: process.env.ANDROID_PLAY_TRACK,
    versionCode: target.versionCode,
    notes: target.notes,
    screenshots,
    account,
  });
  console.log(JSON.stringify(result));
} else {
  const appId = process.env.ASC_APP_ID;
  const { version, buildNumber, notes, reviewNotes, screenshots = [] } = target;
  if (
    !/^\d+$/.test(appId) ||
    typeof version !== "string" ||
    !/^\d+(\.\d+){0,2}$/.test(version) ||
    typeof buildNumber !== "string" ||
    !/^\d+(\.\d+){0,2}$/.test(buildNumber)
  )
    throw new Error(
      "Use the App Store ID and the exact uploaded iOS version and build number.",
    );
  if ((expo.ios.version ?? expo.version) !== version)
    throw new Error(
      "The iOS review version must match the app config at this commit.",
    );
  if (
    reviewNotes !== undefined &&
    (typeof reviewNotes !== "string" ||
      !reviewNotes.trim() ||
      reviewNotes.length > 4000)
  )
    throw new Error("Apple reviewer notes must be 1–4,000 characters.");
  if (
    !notes ||
    typeof notes !== "object" ||
    Array.isArray(notes) ||
    Object.entries(notes).some(
      ([locale, value]) =>
        !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(locale) ||
        typeof value !== "string" ||
        !value.trim() ||
        value.length > 4000,
    )
  )
    throw new Error(
      "iOS release notes must map locales to 1–4,000 characters.",
    );
  const assets = await Promise.all(
    screenshots.map(async ({ locale, displayType, path }) => {
      if (
        !/^APP_IPHONE_(?:6[13579]|DUO)$|^APP_IPAD_PRO_3GEN_(?:11|129)$/.test(
          displayType,
        )
      )
        throw new Error("Invalid App Store screenshot display type.");
      if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(locale))
        throw new Error("Invalid App Store screenshot locale.");
      const bytes = await readFile(await safeScreenshot(path));
      if (
        bytes.length > 10 * 1024 * 1024 ||
        !bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      )
        throw new Error("App Store screenshots must be PNGs of at most 10 MB.");
      const name = `${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}-${basename(path)}`;
      return { locale, displayType, bytes, name };
    }),
  );
  const { request, list } = createAppleClient({
    keyId: process.env.ASC_KEY_ID,
    issuerId: process.env.ASC_ISSUER_ID,
    privateKey: process.env.ASC_PRIVATE_KEY,
  });
  const app = (await request(`/v1/apps/${appId}`)).data;
  if (app.attributes.bundleId !== expo.ios.bundleIdentifier)
    throw new Error(
      "App Store Connect app bundle ID does not match the published app.",
    );
  const prerelease = (
    await list(`/v1/apps/${appId}/preReleaseVersions?limit=200`)
  ).find(
    ({ attributes }) =>
      attributes.platform === "IOS" && attributes.version === version,
  );
  const builds = prerelease
    ? await list(`/v1/preReleaseVersions/${prerelease.id}/builds?limit=200`)
    : [];
  if (
    !builds.some(
      ({ attributes }) =>
        attributes.version === buildNumber &&
        attributes.processingState === "VALID" &&
        !attributes.expired,
    )
  )
    throw new Error(
      "Wait for the requested iOS build to finish processing in TestFlight.",
    );
  const versions = (
    await list(`/v1/apps/${appId}/appStoreVersions?limit=200`)
  ).filter(({ attributes }) => attributes.platform === "IOS");
  let appVersion = versions.find(
    ({ attributes }) => attributes.versionString === version,
  );
  if (!appVersion) {
    appVersion = (
      await request("/v1/appStoreVersions", "POST", {
        type: "appStoreVersions",
        attributes: {
          platform: "IOS",
          versionString: version,
          releaseType: "AFTER_APPROVAL",
        },
        relationships: { app: relation("apps", appId) },
      })
    ).data;
  }
  const state =
    appVersion.attributes.appVersionState ??
    appVersion.attributes.appStoreState;
  if (
    [
      "PREPARE_FOR_SUBMISSION",
      "METADATA_REJECTED",
      "DEVELOPER_REJECTED",
      "REJECTED",
    ].includes(state)
  ) {
    const locales = await list(
      `/v1/appStoreVersions/${appVersion.id}/appStoreVersionLocalizations?limit=200`,
    );
    const byLocale = new Map(
      locales.map((entry) => [entry.attributes.locale, entry.id]),
    );
    for (const locale of [
      ...Object.keys(notes),
      ...assets.map((asset) => asset.locale),
    ])
      if (!byLocale.has(locale))
        throw new Error(
          `Add the full App Store listing for ${locale} before submitting.`,
        );
    for (const [locale, whatsNew] of Object.entries(notes)) {
      const entry = locales.find((item) => item.id === byLocale.get(locale));
      if (entry.attributes.whatsNew !== whatsNew)
        await request(`/v1/appStoreVersionLocalizations/${entry.id}`, "PATCH", {
          type: "appStoreVersionLocalizations",
          id: entry.id,
          attributes: { whatsNew },
        });
    }
    if (reviewNotes) {
      const detail = (
        await request(
          `/v1/appStoreVersions/${appVersion.id}/appStoreReviewDetail?fields[appStoreReviewDetails]=notes`,
        )
      ).data;
      if (!detail)
        throw new Error(
          "Set up the App Review contact and access details for this app first.",
        );
      if (detail.attributes.notes !== reviewNotes)
        await request(`/v1/appStoreReviewDetails/${detail.id}`, "PATCH", {
          type: "appStoreReviewDetails",
          id: detail.id,
          attributes: { notes: reviewNotes },
        });
    }
    for (const asset of assets) {
      const localizationId = byLocale.get(asset.locale);
      const sets = await list(
        `/v1/appStoreVersionLocalizations/${localizationId}/appScreenshotSets?limit=200`,
      );
      const set =
        sets.find(
          (item) => item.attributes.screenshotDisplayType === asset.displayType,
        ) ??
        (
          await request("/v1/appScreenshotSets", "POST", {
            type: "appScreenshotSets",
            attributes: { screenshotDisplayType: asset.displayType },
            relationships: {
              appStoreVersionLocalization: relation(
                "appStoreVersionLocalizations",
                localizationId,
              ),
            },
          })
        ).data;
      await uploadScreenshot({ request, list }, set.id, asset);
    }
  }
  const result = spawnSync(
    process.execPath,
    [".github/scripts/apple-review.mjs"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        APP_VERSION: version,
        BUILD_NUMBER: buildNumber,
        ASC_OPERATION: "review",
      },
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function uploadScreenshot({ request, list }, setId, { bytes, name }) {
  const screenshots = await list(
    `/v1/appScreenshotSets/${setId}/appScreenshots?limit=200`,
  );
  const screenshot =
    screenshots.find((entry) => entry.attributes.fileName === name) ??
    (
      await request("/v1/appScreenshots", "POST", {
        type: "appScreenshots",
        attributes: { fileName: name, fileSize: bytes.length },
        relationships: {
          appScreenshotSet: relation("appScreenshotSets", setId),
        },
      })
    ).data;
  const uri = `/v1/appScreenshots/${screenshot.id}`;
  let state = screenshot.attributes.assetDeliveryState.state;
  if (state === "AWAITING_UPLOAD") {
    for (const { url, offset, length, method, requestHeaders } of screenshot
      .attributes.uploadOperations) {
      const destination = new URL(url);
      if (
        destination.protocol !== "https:" ||
        !destination.hostname.endsWith(".apple.com") ||
        method !== "PUT" ||
        !Number.isInteger(offset) ||
        !Number.isInteger(length) ||
        offset < 0 ||
        length <= 0 ||
        offset + length > bytes.length
      )
        throw new Error("Unexpected App Store screenshot upload instruction.");
      const response = await fetch(destination, {
        method,
        headers: Object.fromEntries(
          requestHeaders.map(({ name, value }) => [name, value]),
        ),
        body: bytes.subarray(offset, offset + length),
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok)
        throw new Error(
          `App Store screenshot upload failed (${response.status}).`,
        );
    }
    const committed = await request(uri, "PATCH", {
      type: "appScreenshots",
      id: screenshot.id,
      attributes: {
        sourceFileChecksum: createHash("md5").update(bytes).digest("hex"),
        uploaded: true,
      },
    });
    state = committed.data.attributes.assetDeliveryState.state;
  }
  for (let attempt = 0; attempt < 24; attempt++) {
    if (state === "COMPLETE") return;
    if (state === "FAILED")
      throw new Error(`Apple rejected screenshot ${name}.`);
    await wait(5000);
    state = (await request(uri)).data.attributes.assetDeliveryState.state;
  }
  throw new Error(
    `Apple is still processing screenshot ${name}. Retry store submission after processing.`,
  );
}
