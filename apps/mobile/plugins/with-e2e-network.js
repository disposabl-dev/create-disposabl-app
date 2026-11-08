const {
  withAndroidManifest,
  withDangerousMod,
} = require("@expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

module.exports = function withE2ENetwork(config) {
  const backend = new URL(process.env.EXPO_PUBLIC_CONVEX_URL || "");
  if (
    process.env.EXPO_PUBLIC_E2E !== "true" ||
    process.env.E2E_ANDROID_LOOPBACK !== "true" ||
    backend.protocol !== "http:" ||
    backend.hostname !== "10.0.2.2"
  ) {
    throw new Error(
      "E2E network configuration requires the Android emulator loopback backend",
    );
  }
  config = withAndroidManifest(config, (result) => {
    result.modResults.manifest.application[0].$[
      "android:networkSecurityConfig"
    ] = "@xml/e2e_network_security_config";
    return result;
  });
  return withDangerousMod(config, [
    "android",
    async (result) => {
      const dir = path.join(
        result.modRequest.platformProjectRoot,
        "app/src/main/res/xml",
      );
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "e2e_network_security_config.xml"),
        '<?xml version="1.0" encoding="utf-8"?>\n<network-security-config><domain-config cleartextTrafficPermitted="true"><domain includeSubdomains="false">10.0.2.2</domain></domain-config></network-security-config>\n',
      );
      return result;
    },
  ]);
};
