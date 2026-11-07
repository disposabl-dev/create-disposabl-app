import { Check } from "lucide-react";
import {
  platforms,
  resolvePlatforms,
  type Platform,
} from "@disposabl/disposabl-kit/platforms";
import { TextLink } from "./shell";
import { BrandIcon } from "./brand-icon";

export const stackGroups = [
  {
    id: "web",
    label: "Web",
    platforms: ["web"],
    stack: ["React", "TanStack Start", "Vite", "Tailwind CSS"],
    description:
      "Fast local development, typed routing, and pages that can be prerendered. Your website is the starting point.",
    path: "apps/web",
    note: "Always included",
  },
  {
    id: "mobile",
    label: "iOS and Android",
    platforms: ["ios", "android"],
    stack: ["React Native", "Expo", "Expo Router"],
    description:
      "React Native projects for your selected mobile platforms, sharing a backend with your website. Build and install real native apps.",
    path: "apps/mobile",
    note: "iOS needs macOS + Xcode; Android needs the Android SDK",
  },
  {
    id: "desktop",
    label: "macOS, Windows, and Linux",
    platforms: ["macos", "windows", "linux"],
    stack: ["Electron", "Electron Forge", "React"],
    description:
      "Package your web experience for your selected desktop operating systems, with platform-specific installers.",
    path: "apps/desktop",
    note: "Build and signing requirements vary by operating system",
  },
  {
    id: "api",
    label: "HTTP API",
    platforms: ["api"],
    stack: ["OpenAPI", "Convex HTTP", "TypeScript"],
    description:
      "A documented HTTP API for your backend operations. Connect services and build integrations around your app.",
    path: "packages/backend",
    note: "Required by CLI and TypeScript SDK",
  },
  {
    id: "clients",
    label: "CLI and TypeScript SDK",
    platforms: ["cli", "typescript-sdk"],
    stack: ["CLI", "TypeScript SDK", "OpenAPI"],
    description:
      "Add your selected developer clients, built from the API contract: terminal commands for CLI, typed calls for SDK.",
    path: "packages/cli · packages/sdk",
    note: "Enables the API automatically",
  },
  {
    id: "mcp",
    label: "Model Context Protocol",
    platforms: ["mcp"],
    stack: ["Model Context Protocol", "Convex"],
    description:
      "Expose your app's operations as tools that compatible AI assistants can call through MCP.",
    path: "packages/backend",
    note: "Select and secure the operations you expose",
  },
];

export function PlatformExplorer({
  selected,
  onChange,
}: {
  selected: Platform[];
  onChange: (value: Platform[]) => void;
}) {
  function toggle(id: Platform) {
    if (id === "web") return;
    const next = selected.includes(id)
      ? selected.filter(
          (item) =>
            item !== id &&
            !(id === "api" && ["cli", "typescript-sdk"].includes(item)),
        )
      : [...selected, id];
    onChange(resolvePlatforms(next));
  }
  const active = stackGroups.filter((group) =>
    group.platforms.some((id) => selected.includes(id as Platform)),
  );
  return (
    <section
      id="platforms"
      className="platform-section launch-container"
      aria-labelledby="platform-title"
    >
      <div className="section-heading">
        <h2 id="platform-title">Pick your platforms.</h2>
      </div>
      <div
        className="platform-toggles"
        role="group"
        aria-label="Choose platforms"
      >
        {platforms.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={selected.includes(id)}
            aria-disabled={id === "web"}
            onClick={() => toggle(id)}
            className="platform-toggle"
          >
            <BrandIcon name={label} />
            <span>{label}</span>
            <span className="toggle-check" aria-hidden="true">
              {selected.includes(id) && <Check size={11} />}
            </span>
            {id === "web" && <span className="sr-only"> included</span>}
          </button>
        ))}
      </div>
      <div className="stack-results" aria-live="polite" aria-atomic="false">
        {active.map(({ id, stack, platforms: targets }) => (
          <article className="stack-card" key={id} data-stack={id}>
            <h3>
              {platforms
                .filter(
                  (platform) =>
                    targets.includes(platform.id) &&
                    selected.includes(platform.id),
                )
                .map((platform) => platform.label)
                .join(" + ")}
            </h3>
            <p className="selected-targets sr-only">
              Selected:{" "}
              {platforms
                .filter(
                  (platform) =>
                    targets.includes(platform.id) &&
                    selected.includes(platform.id),
                )
                .map((platform) => platform.label)
                .join(" + ")}
            </p>
            <div className="stack-tags">
              {stack.map((name) => (
                <span key={name}>
                  <BrandIcon name={name} />
                  {name}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
      <div className="shared-stack">
        <div>
          {["TypeScript", "Convex", "Bun", "Turborepo", "GitHub Actions"].map(
            (name) => (
              <span key={name} className="stack-brand" title={name}>
                <BrandIcon name={name} />
                <span>{name}</span>
              </span>
            ),
          )}
        </div>
      </div>
      <div className="workbench-footer">
        <TextLink href="/stack">Explore the stack</TextLink>
      </div>
    </section>
  );
}
