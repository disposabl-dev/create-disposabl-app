# App branding and visual design

Use when creating or substantially redesigning a Disposabl app. Apply `frontend-design` when available; otherwise use the user's brief and the guidance below. Preserve an existing brand when provided.

Before implementing screens, derive a short brand direction from the app's purpose, audience, main task, and intended tone. Choose a fitting product name or use the supplied one, a typography hierarchy, color palette, spacing and shape rules, and an image/icon approach. Record the choices briefly in the implementation plan and proceed with reasonable assumptions when the brief is sufficient.

Give the app its own identity across the landing page, authentication, dashboard, mobile screens, desktop shell, app icon, favicon, metadata, empty states, and download pages. Replace Disposabl starter branding and generic copy with product-specific content. Keep layouts and interactions appropriate to each platform while sharing the same visual language.

Use superscripts, tiny uppercase eyebrows, and decorative labels sparingly. Prefer clear headings and readable body text. Reserve actual superscript formatting for meaningful notation, references, or units; avoid using it as decoration on every section or card. Keep essential labels, prices, and actions at an accessible reading size.

Make the design distinctive through choices that suit the product, rather than a repeated starter palette or the same hero, card grid, and badges with a new name. For example, a meal planner's recipe imagery and weekly schedule should guide its design; a finance tool's data hierarchy should lead to a different treatment. These examples are directions, not mandatory themes.

Use concise copy and real visuals suited to the product. Prioritize useful task UI over decorative filler; do not impose a fixed palette.

For native screens, use NativeWind `className` utilities and the shared theme tokens, such as `bg-background`, `text-foreground`, and `border-border`. Do not introduce StyleSheet definitions or inline layout styles. Pass measured values through NativeWind CSS variables. Keep product-specific light/dark colors in the existing theme system and preserve its appearance preference.

Use `useTheme` from `packages/disposabl-kit/mobile/design/use-theme.ts` only where native APIs need resolved colors, such as navigation headers, symbols, and status bars. Reuse the existing provider; fixed light surfaces can become unreadable when Settings switches the system chrome to Dark.

When the app exposes Light, Dark, and System settings, verify the rendered guest and signed-in screens in those modes, including after restart and an OS appearance change in System mode. A changed selector label does not prove the screen changed. Add behavior coverage for the visible colors and preference persistence in `packages/tests`.

Use the app's real tasks and representative content to evaluate the design. Check the landing page and signed-in experience at desktop and mobile widths in the browser, and inspect native layouts on the requested target device. Verify typography, contrast, hierarchy, focus states, wrapping, empty/error/loading states, and consistency with the chosen brand. Fix visible issues before calling the design complete.
