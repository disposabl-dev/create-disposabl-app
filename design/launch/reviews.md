# Design and release reviews

All reviews occurred November 7, 2026. Agents received bounded tasks with fresh context. These are expert judgments, not visitor preference tests. No score establishes conversion, engagement, awards, or virality.

## Exploration

A design agent proposed 20 visual families, each with a distinct organizing idea and an explicit tradeoff. Five reusable compositions produced 100 rendered studies. The designer favored Launch Sheet, Switchboard, and Manifesto for clarity, useful interaction, and ownership. All 100 were then rendered at desktop and mobile widths with TesterArmy E2E. The coordinator and a fresh visual reviewer inspected all four contact sheets.

The coordinator's `studies/scores.json` records a subjective selection score for every candidate using six criteria. Scores combine the inspected visual-family qualities with composition tradeoffs. They are a reproducible selection aid, not 100 independent user tests. The production design developed beyond these studies.

## Round 1: implementation and product credibility

An independent reviewer read the source and first desktop screenshot. Subjective scores: distinctiveness 7/10, action clarity 7/10, credibility 8/10.

Findings and changes:

- Social metadata initially referenced an asset still being built. Added and inspected the actual 1200×630 PNG and verified its signature/dimensions through E2E.
- Grouped stack descriptions implied both iOS and Android even after one was disabled. Added explicit selected-target labels and selection-aware wording.
- Decorative mockup text appeared in the accessibility tree. Hid the illustration from assistive technology; platform meaning is provided by real page content.
- Mobile menu needed Escape dismissal and focus return. Implemented and behavior-tested both.
- Generator filtering required inspection. Moved page-specific metadata into the marketing routes and removed those routes, marketing tests, and stale generated route tree from packaged starters.

## Round 2: independent visual critique

A fresh reviewer inspected the production desktop screenshot, social image, and all four study contact sheets. Subjective scores: design 8/10, typography 8/10, action clarity 6.5/10, memorability 7.5/10.

The reviewer preferred the production illustration and blue/lime contrast to the generic platform diagrams in the studies. They rejected the strongest saturated backgrounds as distracting.

Changes after this review:

- Added explicit numbered copy/paste instructions that switch correctly for terminal mode.
- Increased copy-button, tab, agent instruction, and fee-note sizes.
- Preserved requested store controls but replaced their outward arrows with an unavailable “Soon” label, with keyboard/touch-visible explanations.
- Corrected two near-threshold text contrast failures found by axe. Subsequent desktop and mobile scans reported zero WCAG A/AA violations in the marketing region.

The action-clarity score went down in this independent review. We did not edit it to manufacture a rising score. The improvements are recorded as changes, not as unmeasured conversion gains.

## Round 3: independent release review

A fresh release reviewer checked the diff, built metadata, reset boundaries, and linked GitHub job timestamps.

- Agent credit billing was not implemented in this checkout. The product owner confirmed that pricing must be labeled planned. The card, FAQ, and guide now agree; no purchase CTA pretends to work.
- Verified all published CI durations. Removed ambiguous upload wording from the web job description because its release-artifact step was skipped.
- No other blocker was found in the inspected routing, upcoming labels, or generator boundary. This is source/build evidence, not proof of deployed account or payment behavior.

## Coordinator's final assessment

The page now explains the product, provides a working first action, rewards scrolling with a useful platform explorer, and provides concrete answers about ownership, costs, and delivery. The social image matches the page. The production design is more legible and specific than the early study set.

The largest remaining opportunity is a real, verified example app or short recorded build. The illustrative hero is labeled honestly. No invented testimonial, usage count, award, customer logo, or benchmark was added to fill that gap. Product Hunt or X response cannot be predicted by scoring this page. A live social-crawler fetch and real visitor feedback after deployment are still needed.
