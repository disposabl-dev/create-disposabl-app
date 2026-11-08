import { test } from "node:test";
import assert from "node:assert/strict";
import { legalConfig, legalIsDraft } from "../disposabl-kit/legal/config";
import { spawnSync } from "node:child_process";
import { privacy } from "../disposabl-kit/legal/documents/privacy";

test("product privacy draft names connected and configured providers", () => {
  assert.equal(legalConfig.reviewed, false);
  assert.equal(legalIsDraft(), true);
  const rendered = spawnSync(
    process.execPath,
    [
      "-e",
      `import { createElement } from "react"; import { renderToStaticMarkup } from "react-dom/server"; import { LegalPage } from "./packages/disposabl-kit/client/components/legal-page.tsx"; console.log(renderToStaticMarkup(createElement(LegalPage, { slug: "privacy" })));`,
    ],
    { cwd: import.meta.dirname + "/../..", encoding: "utf8" },
  );
  assert.equal(rendered.status, 0, rendered.stderr);
  const html = rendered.stdout;
  assert.match(html, /Draft documents/);
  for (const name of ["GitHub", "Expo", "Boat"])
    assert.match(html, new RegExp(`${name}:`));
  const disclosure = privacy.sections.find(
    (section) => section.title === "Service providers and disclosures",
  );
  assert.ok(disclosure);
  for (const name of ["Convex", "GitHub", "Expo", "Boat", "Google", "PostHog"])
    assert.ok(
      disclosure.paragraphs.some((paragraph) =>
        paragraph.startsWith(`${name}: `),
      ),
      name,
    );
  for (const name of ["GitHub", "Expo", "Boat"])
    assert.match(
      legalConfig.providers.find((provider) => provider.name === name)!.purpose,
      /when/,
    );
  assert.ok(
    !legalConfig.providers.some((provider) =>
      ["Autumn", "RevenueCat"].includes(provider.name),
    ),
  );
});
