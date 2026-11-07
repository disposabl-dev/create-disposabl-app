# Disposabl launch design

Created November 7, 2026. This folder is review material, not a public route or part of generated apps.

- Open `studies/index.html` locally to browse 100 self-contained HTML hero studies.
- `studies/manifest.json` identifies each family, composition, rationale, and tradeoff.
- `evidence/contact-sheet-1.jpg` through `contact-sheet-4.jpg` show all 100 desktop studies, 25 per sheet, numbered left to right, top to bottom.
- `evidence/results.json` records structural browser checks for all 100 studies at 1440px and 390px.
- `research.md` separates current live observations from independently dated recent material.
- `reviews.md` records independent critiques and the resulting changes. Scores are subjective, not measured conversion or virality.
- `verification.md` records checks, commands, and remaining infrastructure limits.

## What the 100 versions mean

These are 20 visual families across five composition patterns. They vary hierarchy, typography, platform diagrams, colors, and arrangement. They are **hero studies**, not 100 separately implemented full websites or 100 independent user-tested designs. The production design is a further iteration with original responsive device artwork, an interactive stack explorer, detailed guides, pricing, FAQs, and social artwork.

The study gallery contains exploratory copy, including rejected broad free claims. Only the production site copy represents the intended offer. Its local/provider cost boundaries and planned credit billing are explicit.

The generator (`studies/build.py`) reproduces the initial exploration. Run `bun fmt design/launch/studies` after regenerating to apply repository formatting. Do not treat structural pass results as proof of accessibility, CTA correctness, or good design; the production site receives separate tests.

## Direction selected

Use the editorial clarity of Launch Sheet, the inspectable choices of Switchboard, and the ownership message of Manifesto. Reject full-screen saturated variants and schematic platform boxes: they distract from the first action or make every builder look alike. Keep a warm background, blue action color, a consistent typographic hierarchy, and a labeled illustrative app rather than pretend a prompt generated a live result.

## Scope

This PR changes the public website, metadata, social image, and marketing behavior tests. It does not implement mobile distribution, localization, credit billing, automated quality ranking, or production release credentials. These are presented with their current limitations. Android and iOS native apps are unchanged.
