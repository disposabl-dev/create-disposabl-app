const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);
if (process.env.EXPO_NO_DOTENV === "1") {
  // SDK 58's development env module otherwise reloads .env files after shell values.
  const blocked = config.resolver.blockList ?? [];
  config.resolver.blockList = [
    ...(Array.isArray(blocked) ? blocked : [blocked]),
    /[/\\]\.env(?:\.(?:local|development|production)(?:\.local)?)?$/,
  ];
}

module.exports = withNativewind(config, {
  inlineVariables: false,
});
