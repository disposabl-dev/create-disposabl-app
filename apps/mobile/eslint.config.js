// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react-native",
              importNames: ["StyleSheet"],
              message:
                "Use NativeWind classes and theme tokens for mobile styling.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXOpeningElement[name.name!='StatusBar'] > JSXAttribute[name.name='style'], JSXAttribute[name.name='contentContainerStyle']",
          message:
            "Use className/contentContainerClassName; pass runtime values through NativeWind CSS variables.",
        },
      ],
    },
  },
]);
