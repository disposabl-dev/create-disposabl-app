import { test } from "node:test";
import assert from "node:assert/strict";
import { legalConfig, legalIsDraft } from "../disposabl-kit/legal/config";
import { spawnSync } from "node:child_process";
import { privacy } from "../disposabl-kit/legal/documents/privacy";

test("product privacy policy names connected and configured providers", () => {
  assert.equal(legalConfig.reviewed, true);
  assert.equal(legalIsDraft(), false);
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
  assert.doesNotMatch(html, /Draft documents/);
  assert.match(html, /Effective 2026-11-19/);
  for (const name of ["GitHub", "Expo", "Boat", "OpenAI", "Vercel", "Stripe"])
    assert.match(html, new RegExp(`${name}:`));
  const disclosure = privacy.sections.find(
    (section) => section.title === "Service providers and disclosures",
  );
  assert.ok(disclosure);
  for (const name of [
    "Convex",
    "GitHub",
    "Expo",
    "Boat",
    "OpenAI",
    "Vercel",
    "Stripe",
    "Google",
    "PostHog",
    "Autumn",
    "RevenueCat",
  ])
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
});

test("product policy renders AI, retention and deletion instructions", () => {
  for (const [slug, expected] of [
    [
      "privacy",
      [
        "OpenAI",
        "at least 13",
        "permission from a parent or legal guardian",
        "no fixed deletion date",
        "United States",
      ],
    ],
    [
      "terms",
      [
        "watch public Guides without an account",
        "at least 13",
        "permission from a parent or legal guardian",
        "additional age requirements",
      ],
    ],
    [
      "delete-account",
      [
        "Save the receipt reference",
        "schedules bounded cleanup",
        "vivek@yast.ai",
        "your provider accounts",
      ],
    ],
  ] as const) {
    const rendered = spawnSync(
      process.execPath,
      [
        "-e",
        `import { createElement } from "react"; import { renderToStaticMarkup } from "react-dom/server"; import { LegalPage } from "./packages/disposabl-kit/client/components/legal-page.tsx"; console.log(renderToStaticMarkup(createElement(LegalPage, { slug: "${slug}" })));`,
      ],
      { cwd: import.meta.dirname + "/../..", encoding: "utf8" },
    );
    assert.equal(rendered.status, 0, rendered.stderr);
    for (const text of expected)
      assert.ok(rendered.stdout.includes(text), text);
  }
});
