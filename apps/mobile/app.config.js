const { createHash } = require("node:crypto");
const project = require("../../package.json");

module.exports = ({ config }) => {
  const channel =
    process.env.DISPOSABL_MOBILE_CHANNEL ||
    process.env.DISPOSABL_ANDROID_CHANNEL ||
    (process.env.EAS_BUILD_PROFILE &&
      require("./eas.json").build[process.env.EAS_BUILD_PROFILE]?.channel) ||
    "development";
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(channel)) {
    throw new Error("Invalid DISPOSABL_MOBILE_CHANNEL");
  }
  const projectId = process.env.EXPO_PROJECT_ID || config.extra?.eas?.projectId;
  const suffix = createHash("sha256")
    .update(project.name)
    .digest("hex")
    .slice(0, 12);
  const billingScheme = `disposabl-billing-${suffix}-${channel}`;
  const basePackage = config.android?.package || `app.disposabl.a${suffix}`;
  const versionCode = Number(process.env.DISPOSABL_ANDROID_VERSION_CODE || 1);
  if (
    !Number.isSafeInteger(versionCode) ||
    versionCode < 1 ||
    versionCode > 2100000000
  ) {
    throw new Error(
      "DISPOSABL_ANDROID_VERSION_CODE must be a positive Android version code",
    );
  }
  const iosBuildNumber = process.env.DISPOSABL_IOS_BUILD_NUMBER || "1";
  if (!/^[1-9]\d*$/.test(iosBuildNumber))
    throw new Error("Invalid DISPOSABL_IOS_BUILD_NUMBER");
  // Fail instead of exporting an update against another preview's backend.
  for (const name of ["CONVEX_URL", "CONVEX_SITE_URL"]) {
    const deployed = process.env[name];
    const exported = process.env[`EXPO_PUBLIC_${name}`];
    if (deployed && deployed !== exported) {
      throw new Error(
        `EXPO_PUBLIC_${name} conflicts with the web deployment. Remove it from the shared EAS environment.`,
      );
    }
  }
  return {
    ...config,
    scheme:
      process.env.EXPO_PUBLIC_E2E === "true" && process.env.E2E_ANDROID_SCHEME
        ? [process.env.E2E_ANDROID_SCHEME]
        : [
            ...new Set([
              ...[config.scheme || []].flat(),
              `disposabl-${project.name.replace(/[^a-z0-9.-]/g, "-")}`,
              billingScheme,
            ]),
          ],
    extra: { ...config.extra, billingReturnChannel: channel },
    owner: process.env.EXPO_OWNER || config.owner,
    slug: process.env.EXPO_SLUG || config.slug,
    ios: {
      ...config.ios,
      ...(projectId ? { runtimeVersion: { policy: "fingerprint" } } : {}),
      bundleIdentifier:
        channel === "production"
          ? config.ios?.bundleIdentifier || `app.disposabl.a${suffix}`
          : `${config.ios?.bundleIdentifier || `app.disposabl.a${suffix}`}.preview`,
      buildNumber: iosBuildNumber,
    },
    android: {
      ...config.android,
      ...(projectId ? { runtimeVersion: { policy: "fingerprint" } } : {}),
      package:
        process.env.EXPO_PUBLIC_E2E === "true" && process.env.E2E_ANDROID_APP_ID
          ? process.env.E2E_ANDROID_APP_ID
          : channel === "production"
            ? basePackage
            : `${basePackage}.${channel.replaceAll("-", "")}`,
      versionCode,
    },
    plugins: [
      ...(config.plugins || []),
      "./plugins/with-android-signing.js",
      ...(process.env.EXPO_PUBLIC_E2E === "true"
        ? [
            ...(process.env.E2E_ANDROID_LOOPBACK === "true"
              ? ["./plugins/with-e2e-network.js"]
              : []),
            [
              "expo-dev-client",
              {
                addGeneratedScheme: false,
                toolsButton: false,
                skipOnboarding: true,
                showMenuAtLaunch: false,
              },
            ],
          ]
        : []),
    ],
    ...(projectId
      ? {
          runtimeVersion: { policy: "fingerprint" },
          extra: {
            ...config.extra,
            billingReturnChannel: channel,
            eas: { ...config.extra?.eas, projectId },
          },
        }
      : {}),
    updates: {
      ...config.updates,
      // Start from the newest cached bundle while downloading for the next launch.
      checkAutomatically: "ON_LOAD",
      fallbackToCacheTimeout: 0,
      ...(projectId
        ? {
            url: `https://u.expo.dev/${projectId}`,
            requestHeaders: { "expo-channel-name": channel },
          }
        : {}),
      ...(process.env.EXPO_PUBLIC_E2E === "true" ? { enabled: false } : {}),
    },
  };
};
