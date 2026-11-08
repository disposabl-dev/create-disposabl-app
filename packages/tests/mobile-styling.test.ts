import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import config from "../../disposabl.json";

// Compile the actual CSS: component defaults must not hide colors or sizes
// supplied by a screen, including destructive actions in Settings.
test(
  "NativeWind utilities override shared text defaults",
  {
    skip: !config.platforms.some((platform) =>
      ["android", "ios"].includes(platform),
    ),
  },
  async () => {
    const root = join(import.meta.dirname, "../..");
    const require = createRequire(join(root, "apps/mobile/package.json"));
    const postcss = require("postcss");
    const tailwind = require("@tailwindcss/postcss");
    const { compile } = require("react-native-css/compiler");
    const path = join(root, "packages/disposabl-kit/mobile/global.css");
    const result = await postcss([tailwind()]).process(
      readFileSync(path, "utf8"),
      { from: path },
    );
    type Rule = { s: number[]; d: (Record<string, unknown> | unknown[])[] };
    const rules = new Map<string, Rule[]>(
      compile(result.css, { inlineVariables: false }).stylesheet().s,
    );
    for (const [utility, base, property, value] of [
      ["text-[#71717a]", "themed-text", "color", "#71717a"],
      ["text-[#dc2626]", "themed-text", "color", "#dc2626"],
      ["text-[19px]", "type-default", "fontSize", 19],
    ] as const) {
      const override = rules.get(utility)!;
      const defaults = rules.get(base)!;
      assert.ok(
        override?.length && defaults?.length,
        `${utility} and ${base} compile`,
      );
      // Native CSS precedence stores source order first, then specificity.
      assert.ok(
        override.every((rule) =>
          defaults.every(
            (fallback) =>
              rule.s[1] === fallback.s[1] && rule.s[0]! > fallback.s[0]!,
          ),
        ),
        `${utility} wins over ${base}`,
      );
      assert.ok(
        override.some((rule) =>
          rule.d.some(
            (declaration) =>
              !Array.isArray(declaration) && declaration[property] === value,
          ),
        ),
        `${utility} resolves ${property}`,
      );
    }
  },
);
