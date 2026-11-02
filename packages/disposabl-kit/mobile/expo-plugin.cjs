const { withAppBuildGradle } = require("expo/config-plugins");

// RN's default bundle inputs cover the app directory, not workspace packages.
module.exports = (config) =>
  withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== "groovy")
      throw new Error("Expected a Groovy Android build");
    const marker = "// Disposabl workspace bundle inputs.";
    if (mod.modResults.contents.includes(marker)) return mod;
    mod.modResults.contents += `
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
}
`;
    return mod;
  });
