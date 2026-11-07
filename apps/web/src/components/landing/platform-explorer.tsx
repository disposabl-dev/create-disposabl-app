import {
  Check,
  Code2,
  Globe2,
  Laptop,
  Smartphone,
  Terminal,
  ArrowUpRight,
} from "lucide-react";
import {
  platforms,
  resolvePlatforms,
  type Platform,
} from "@disposabl/disposabl-kit/platforms";
import { TextLink } from "./shell";

export const stackGroups = [
  {
    id: "web",
    label: "The web, without the wait.",
    platforms: ["web"],
    icon: Globe2,
    stack: ["React", "TanStack Start", "Vite", "Tailwind CSS"],
    description:
      "Fast local development, typed routing, and pages that can be prerendered. Your website is the starting point.",
    path: "apps/web",
    note: "Always included",
  },
  {
    id: "mobile",
    label: "Made for pockets.",
    platforms: ["ios", "android"],
    icon: Smartphone,
    stack: ["React Native", "Expo", "Expo Router"],
    description:
      "React Native projects for your selected mobile platforms, sharing a backend with your website. Build and install real native apps.",
    path: "apps/mobile",
    note: "iOS needs macOS + Xcode; Android needs the Android SDK",
  },
  {
    id: "desktop",
    label: "At home on the desktop.",
    platforms: ["macos", "windows", "linux"],
    icon: Laptop,
    stack: ["Electron", "Electron Forge", "React"],
    description:
      "Package your web experience for your selected desktop operating systems, with platform-specific installers.",
    path: "apps/desktop",
    note: "Build and signing requirements vary by operating system",
  },
  {
    id: "api",
    label: "Let other software in.",
    platforms: ["api"],
    icon: Code2,
    stack: ["OpenAPI", "Convex HTTP", "TypeScript"],
    description:
      "A documented HTTP API for your backend operations. Connect services and build integrations around your app.",
    path: "packages/backend",
    note: "Required by CLI and TypeScript SDK",
  },
  {
    id: "clients",
    label: "Useful beyond the screen.",
    platforms: ["cli", "typescript-sdk"],
    icon: Terminal,
    stack: ["CLI", "TypeScript SDK", "OpenAPI"],
    description:
      "Add your selected developer clients, built from the API contract: terminal commands for CLI, typed calls for SDK.",
    path: "packages/cli · packages/sdk",
    note: "Enables the API automatically",
  },
  {
    id: "mcp",
    label: "Give agents a way in.",
    platforms: ["mcp"],
    icon: Code2,
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
      <div className="section-heading section-heading-split">
        <div>
          <p className="eyebrow">ONE PROJECT. PICK YOUR PLATFORMS.</p>
          <h2 id="platform-title">
            Think outside
            <br />
            <span>the browser.</span>
          </h2>
        </div>
        <p>
          A website. An app in your pocket. A tool on your desktop. Choose where
          your idea belongs and see what goes into it.
        </p>
      </div>
      <div className="platform-workbench">
        <div className="workbench-toolbar">
          <span>
            <span className="live-dot" /> YOUR APP'S BLUEPRINT
          </span>
          <span>
            {selected.length} / {platforms.length} platforms
          </span>
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
              <span className="toggle-check" aria-hidden="true">
                {selected.includes(id) && <Check size={12} />}
              </span>
              {label}
              {id === "web" && <span className="required-label">included</span>}
            </button>
          ))}
        </div>
        <p className="platform-help">
          Web is always included. CLI and SDK include the API. Turning API off
          also removes those clients.
        </p>
        <div className="stack-results" aria-live="polite" aria-atomic="false">
          {active.map(
            ({
              id,
              icon: Icon,
              label,
              stack,
              description,
              path,
              note,
              platforms: targets,
            }) => (
              <article className="stack-card" key={id} data-stack={id}>
                <div className="stack-card-top">
                  <Icon size={24} strokeWidth={1.4} />
                  <span>{path}</span>
                </div>
                <h3>{label}</h3>
                <p className="selected-targets">
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
                <p>{description}</p>
                <div className="stack-tags">
                  {stack.map((name) => (
                    <span key={name}>{name}</span>
                  ))}
                </div>
                <p className="stack-note">{note}</p>
              </article>
            ),
          )}
        </div>
        <div className="shared-stack">
          <span className="shared-stack-title">Under every platform</span>
          <span>TypeScript</span>
          <span>Convex</span>
          <span>Bun + Turborepo</span>
          <span>TesterArmy E2E</span>
          <span>GitHub Actions</span>
        </div>
        <div className="workbench-footer">
          <p>
            This is a stack explorer. Choose your final platforms during setup.
          </p>
          <TextLink href="/stack">Take a closer look</TextLink>
        </div>
      </div>
      <a className="quiet-cta" href="#start">
        Found your platforms? Start your project <ArrowUpRight size={16} />
      </a>
    </section>
  );
}
