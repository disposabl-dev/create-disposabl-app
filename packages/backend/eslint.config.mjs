import { defineConfig, globalIgnores } from "eslint/config";

import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import js from "@eslint/js";
import convexPlugin from "@convex-dev/eslint-plugin";
import tsPlugin from "@typescript-eslint/eslint-plugin";

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export default defineConfig([
  {
    files: ["convex/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },

      parser: tsParser,

      parserOptions: {
        project: join(__dirname, "convex", "tsconfig.json"),
      },
    },

    extends: [
      js.configs.recommended,
      ...tsPlugin.configs["flat/recommended-type-checked"],
    ],

    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          varsIgnorePattern: "^_",
          argsIgnorePattern: "^_",
        },
      ],

      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/require-await": "off",
    },
  },
  globalIgnores(["convex/**/_generated/"]),
  ...convexPlugin.configs.recommended,
]);
