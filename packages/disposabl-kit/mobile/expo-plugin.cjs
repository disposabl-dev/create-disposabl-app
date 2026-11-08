const {
  withAppBuildGradle,
  withAndroidManifest,
  withGradleProperties,
} = require("expo/config-plugins");
const { validateAndroidArchitectures } = require("../android-architectures.ts");

// RN's default bundle inputs cover the app directory, not workspace packages.
module.exports = (config) => {
  const app = require("../../../disposabl.json");
  const architectures = validateAndroidArchitectures(app.androidArchitectures);
  const payments = app.features.includes("payments");
  config.extra = {
    ...config.extra,
    disposablAndroidArchitectures: architectures,
    disposablAndroidPayments: payments,
  };
  config = withGradleProperties(config, (mod) => {
    mod.modResults = mod.modResults.filter(
      (item) =>
        item.type !== "property" || item.key !== "reactNativeArchitectures",
    );
    mod.modResults.push({
      type: "property",
      key: "reactNativeArchitectures",
      value: architectures.join(","),
    });
    return mod;
  });
  if (payments) {
    config = withAndroidManifest(config, (mod) => {
      const application = mod.modResults.manifest.application?.[0];
      const activity = application?.activity?.find(
        (entry) => entry.$["android:name"] === ".MainActivity",
      );
      if (!activity) throw new Error("Android MainActivity was not found");
      // External bank verification must return to the pending purchase activity.
      activity.$["android:launchMode"] = "singleTop";
      return mod;
    });
  }
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== "groovy")
      throw new Error("Expected a Groovy Android build");
    const marker = "// Disposabl workspace bundle inputs.";
    const inputs = `
${marker}
tasks.withType(com.facebook.react.tasks.BundleHermesCTask).configureEach {
    inputs.files(fileTree(rootProject.file("../../../packages/disposabl-kit")) {
        include "**/*.ts", "**/*.tsx", "**/*.js", "**/*.cjs", "package.json"
        exclude "**/node_modules/**", "**/dist/**"
    })
    inputs.files(rootProject.file("../../../disposabl.json"),
                 rootProject.file("../../../package.json"),
                 rootProject.file("../../../bun.lock"))
    inputs.files(fileTree(rootProject.file("..")) { include ".env", ".env.*" })
    inputs.property("convexUrl", System.getenv("EXPO_PUBLIC_CONVEX_URL") ?: "")
    inputs.property("convexSiteUrl", System.getenv("EXPO_PUBLIC_CONVEX_SITE_URL") ?: "")
    inputs.property("revenuecatAndroidKey", System.getenv("EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY") ?: "")
    inputs.property("revenuecatAndroidMonthly", System.getenv("EXPO_PUBLIC_REVENUECAT_ANDROID_MONTHLY_PRODUCT") ?: "")
}
`;
    if (mod.modResults.contents.includes(marker)) {
      mod.modResults.contents = mod.modResults.contents.replace(
        /\/\/ Disposabl workspace bundle inputs\.[\s\S]*?^\}/m,
        inputs.trim(),
      );
    } else mod.modResults.contents += inputs;
    return mod;
  });
};
