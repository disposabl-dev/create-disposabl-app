import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const mapPath = process.env.MOBILE_THEME_METRO_MAP;

test(
  "Metro includes one mobile theme context for layout and navigation",
  { skip: !mapPath },
  async () => {
    const map = JSON.parse(await readFile(mapPath!, "utf8"));
    const sources: string[] = [];
    function collect(value: any) {
      if (Array.isArray(value)) return value.forEach(collect);
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value.sources)) sources.push(...value.sources);
      if (value.sections) collect(value.sections);
      if (value.map) collect(value.map);
    }
    collect(map);
    const providers = sources.filter((s) =>
      s.endsWith("/packages/disposabl-kit/mobile/design/theme-provider.tsx"),
    );
    assert.equal(
      providers.length,
      1,
      `Expected one theme provider module, found ${providers.length}: ${providers.join(", ")}`,
    );
    assert(
      sources.some((s) =>
        s.endsWith("/packages/disposabl-kit/mobile/layout.tsx"),
      ),
      "MobileLayout is absent from the graph",
    );
    assert(
      sources.some((s) =>
        s.endsWith("/apps/mobile/src/features/studio/navigation.tsx"),
      ),
      "StudioNavigation is absent from the graph",
    );
  },
);
