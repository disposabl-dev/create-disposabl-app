# Current reference research

Inspected November 7, 2026. Preferred dated window: August 7 through November 7, 2026. Primary sources only. A crawl date, current page appearance, accelerator batch, or funding date does **not** establish a redesign date. No older design trend articles were used.

## Recent primary material and current visual references

| Reference | Evidence of recency | What informed the work |
| --- | --- | --- |
| [TypeSafe AI](https://typesafe.ai/) and [a16z announcement](https://a16z.com/announcement/investing-in-typesafe-ai/) | Funding announcement dated Oct 9, 2026. Homepage visually inspected now; its news banner repeats Oct 9. Design date unknown. | Large, confident type and an explicit product proposition. Its dramatic textured backdrop is memorable but can compete with content; Disposabl instead reserves color for the action and app illustration. |
| [Preference Model](https://preferencemodel.com/) and [a16z announcement](https://a16z.com/announcement/investing-in-preference-model/) | Funding announcement dated Oct 7, 2026. Live homepage visually inspected now. Design date unknown. | A restrained editorial grid, short declarations, and supporting explanations. Use clear section order and generous spacing; avoid borrowing its identity or text. |
| [EveryApp](https://everyapp.com/) and [YC company page](https://www.ycombinator.com/companies/everyapp) | YC Fall 2026 verified. Current site says “launched this week”; exact launch date not independently established. Live homepage visually inspected now. | One clear setup-prompt action with a manual alternative, explicit infrastructure ownership, and a real product image. Disposabl preserves its existing prompt/command path and explains local versus cloud boundaries. |
| [Whiteboard / dev.fast](https://dev.fast/) and [founder launch](https://news.ycombinator.com/item?id=49833867) | Founder post had relative age 42 days during research, approximately late September 2026. [YC membership](https://www.ycombinator.com/companies/devfast) verified. Exact date/design date not established. | Current content ties capabilities to product examples, downloads, and source. Favor a concrete platform explorer over unsupported feature claims. Text/structure research, not visual review. |
| [Skillsync](https://skillsync.com/) and [YC company page](https://www.ycombinator.com/companies/skillsync) | Currently live, YC membership verified. A claimed September launch date could not be independently verified, so it is not counted as recent dated material. | Explain what stays local and how the product works with existing agents. Text/structure research only. |

Two absolute dates satisfy the preferred three-month window; they date funding announcements, not website designs. No recent Founders Fund-backed launch was verified to the same standard. We did not imply that every requested investor category was covered.

## Current competitor content

The following official homepages were read live during this task. Their current design/launch dates were not established, so these are current observations, not claims of recent redesigns.

- [Lovable](https://lovable.dev/): outcome-oriented entry and concrete starting ideas. Lesson: put the next action next to the promise.
- [v0](https://v0.app/): creation prompt, examples, and a path from creation to publishing. Lesson: explain what happens after the first input.
- [Replit](https://replit.com/): connects creative promises to infrastructure. Lesson: name the backend, tests, and delivery work that Disposabl supplies.
- [Base44](https://base44.com/): compact start action surrounded by output categories. Lesson: show tangible possibilities while keeping the hero focused.
- [Bolt](https://bolt.new/): organizes detail by user intent. Lesson: deeper pages should answer real adoption questions, not duplicate a feature grid.

## Product evidence and boundaries

Current repository README, platform definitions, agent docs, test guidance, and workflows were inspected. Local development is connected, not fully offline. Mobile and web UIs are different frameworks with a shared backend. Native publication requires toolchains and signing. The MIT license supports ownership; it does not remove provider dependencies.

[General Translation](https://generaltranslation.com/) is the correct provider name. The intended 85+ language integration is **coming soon**, per product direction. Current provider capabilities do not prove Disposabl integration exists.

Credit rate and no-subscription direction came from the product owner. The owner explicitly confirmed on November 7 that credit pricing must be labeled **planned**. No live purchase, credit balance, model run, or billing transaction was tested.

## Build time evidence

All published observations are from [run 41811672883](https://github.com/disposabl-dev/create-disposabl-app/actions/runs/41811672883), November 4, 2026. Two independent agents verified job/step timestamps via GitHub.

| Workload | Full job | Relevant step | Runner | Source |
| --- | --- | --- | --- | --- |
| Web workflow | 1m 40s | Combined deployment 37s; selected-client build 2s is CLI/SDK, not web | GitHub-hosted | [Job](https://github.com/disposabl-dev/create-disposabl-app/actions/runs/41811672883/job/126559557967) |
| Android native | 29m 22s | Native build 28m 01s | Ubuntu 24.04 | [Job](https://github.com/disposabl-dev/create-disposabl-app/actions/runs/41811672883/job/126559626487) |
| iOS simulator | 26m 39s | Simulator archive 24m 12s | macOS 26 | [Job](https://github.com/disposabl-dev/create-disposabl-app/actions/runs/41811672883/job/126559620792) |

These are one historical CI snapshot, not app-completion estimates or equivalent workload benchmarks. Queue time and store review are excluded. The iOS job is not a signed device/TestFlight release. Older desktop and OTA observations were excluded from the page to avoid mixing workflows or implying OTA equals native compilation.
