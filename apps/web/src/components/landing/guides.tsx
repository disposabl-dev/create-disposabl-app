import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Database,
  GitBranch,
  Globe,
  LockKeyhole,
  MessageSquare,
  Rocket,
  ShieldCheck,
  TestTube2,
} from "lucide-react";
import {
  resolvePlatforms,
  type Platform,
} from "@disposabl/disposabl-kit/platforms";
import { MarketingShell } from "./shell";
import { PlatformExplorer } from "./platform-explorer";
import { BrandIcon } from "./brand-icon";
import { BuildEvidence } from "./build-evidence";
import { Ecosystem } from "./ecosystem";
import "./home.css";

const steps = [
  {
    icon: MessageSquare,
    title: "Describe your app",
    text: "Choose the platforms you need and create a project. Start with one useful workflow you want people to complete.",
  },
  {
    icon: Bot,
    title: "Connect your AI",
    text: "Open the project with your coding agent. Tell it what you want to build using the connected foundation.",
  },
  {
    icon: TestTube2,
    title: "Try it and refine",
    text: "Run a local preview, use the app, and ask your agent to make changes. Test the workflows that matter to you.",
  },
  {
    icon: Rocket,
    title: "Publish when ready",
    text: "Use the included workflows to prepare releases. Check the experience on each target device before sharing it.",
  },
];
const foundations = [
  {
    icon: Globe,
    title: "Interfaces",
    text: "A web app is included. Add mobile, desktop, and developer interfaces as needed.",
  },
  {
    icon: Database,
    title: "Shared data",
    text: "A connected backend gives your app a place to store data and run server logic.",
  },
  {
    icon: LockKeyhole,
    title: "Sign-in",
    text: "Optional authentication provides a starting point for identifying users.",
  },
  {
    icon: TestTube2,
    title: "Tests",
    text: "Starter checks give your agent a place to verify behavior as the app grows.",
  },
  {
    icon: GitBranch,
    title: "Release workflows",
    text: "GitHub workflows help build previews and releases using your own accounts.",
  },
  {
    icon: ShieldCheck,
    title: "Your repository",
    text: "The source belongs in your GitHub repository, where you can inspect and change it.",
  },
];

function GuideHero({ title, intro }: { title: string; intro: string }) {
  return (
    <header className="guide-hero">
      <h1>{title}</h1>
      <p>{intro}</p>
    </header>
  );
}
function StackPage() {
  const [selected, setSelected] = useState<Platform[]>(() =>
    resolvePlatforms(["web"]),
  );
  return (
    <>
      <PlatformExplorer selected={selected} onChange={setSelected} />
      <a
        className="primary-link stack-continue"
        href={`/?platforms=${selected.join(",")}#start`}
      >
        Continue with these platforms <ArrowUpRight size={18} />
      </a>
      <section className="guide-section shared-architecture">
        <div>
          <h2>Connected where it counts</h2>
          <p>
            Your selected platforms connect to a shared backend. Mobile uses
            React Native; desktop packages the web experience. They do not all
            use the same interface components.
          </p>
        </div>
        <div className="architecture-list">
          {[
            {
              name: "Convex",
              text: "Database, server functions, and live updates",
            },
            {
              name: "TypeScript",
              text: "A shared language across the project",
            },
            {
              name: "Bun",
              text: "Dependency installation and project commands",
            },
            {
              name: "Turborepo",
              text: "Coordinates commands across the project",
            },
            { name: "GitHub Actions", text: "Preview and release workflows" },
          ].map(({ name, text }) => (
            <div key={name}>
              <BrandIcon name={name} />
              <span>
                <strong>{name}</strong>
                <small>{text}</small>
              </span>
            </div>
          ))}
        </div>
      </section>
      <Ecosystem />
    </>
  );
}
function BuildPage() {
  return (
    <>
      <GuideHero
        title="How to build with Disposabl"
        intro="Create a project, work with your coding agent, and take your app from a local preview to a release."
      />
      <section className="guide-section">
        <div className="guide-steps">
          {steps.map(({ icon: Icon, title, text }, index) => (
            <article key={title}>
              <div className="step-icon">
                <Icon size={25} />
              </div>
              <h3>{title}</h3>
              <p>{text}</p>
              {index < steps.length - 1 && (
                <ArrowRight
                  className="step-arrow"
                  size={20}
                  aria-hidden="true"
                />
              )}
            </article>
          ))}
        </div>
      </section>
      <section className="guide-section guide-details">
        <div>
          <h2>The practical details</h2>
          <p>Open each step for the practical details.</p>
        </div>
        <div className="detail-list">
          <details>
            <summary>Setup and local preview</summary>
            <p>
              Install Bun, Git, and Node.js 24.8 or newer, then run{" "}
              <code>bunx create-disposabl-app@latest</code>. Setup requires
              internet access and asks you to sign in to Disposabl and connect
              GitHub and Convex. Mobile projects also need Expo.
            </p>
            <p>
              Open the project and run <code>bun run dev</code> to start local
              development. Your source lives in your GitHub repository.
            </p>
          </details>
          <details>
            <summary>Testing and publishing</summary>
            <p>
              Run <code>bun run test</code> against a development or isolated
              preview backend. Add tests for your own workflows, including
              sign-in, permissions, and saved data. Mobile checks need an
              installed app on a simulator or emulator.
            </p>
            <p>
              Release workflows require provider setup, secrets, and potentially
              signing credentials. Provider usage can incur charges. Store
              submission and review are separate from a successful build. Review
              your app’s access controls, data handling, and reliability before
              release.
            </p>
          </details>
          <details id="agent-mode" open>
            <summary>Agent Mode</summary>
            <p>
              Local mode uses your computer and coding agent. Agent Mode runs
              work in a remote sandbox for $5 with 500 credits and no
              subscription. Credit use varies by task. Project context is sent
              outside your computer; review the agent’s changes and test
              results.
            </p>
          </details>
        </div>
      </section>
      <section id="build-times" className="guide-section">
        <div className="guide-section-heading">
          <h2>A real build, in context</h2>
          <p>
            Setup, feature work, compilation, signing, and store review take
            different amounts of time. Here is one actual CI run for context.
          </p>
        </div>
        <BuildEvidence />
      </section>
    </>
  );
}
function WhyPage() {
  return (
    <>
      <GuideHero
        title="Your AI, with the setup done"
        intro="Give your AI a starting point for sign-in, saved data, tests, and publishing."
      />
      <section className="guide-section why-flow">
        <div>
          <h2>Start with the app essentials.</h2>
          <p>
            Keep Claude Code, Codex, or Cursor. Disposabl gives your AI a
            connected project to build on, with code you own.
          </p>
        </div>
        <div className="why-flow-diagram">
          <div>
            <MessageSquare />
            <strong>Your idea</strong>
            <span>Describe what you need</span>
          </div>
          <ArrowRight aria-hidden="true" />
          <div>
            <Bot />
            <strong>Your AI</strong>
            <span>Build and refine</span>
          </div>
          <ArrowRight aria-hidden="true" />
          <div>
            <Database />
            <strong>Your app</strong>
            <span>Run, test, and release</span>
          </div>
        </div>
      </section>
      <section className="guide-section">
        <div className="guide-section-heading">
          <h2>The essentials, already connected</h2>
          <p>
            The pieces work together from the start, and you can change them as
            your needs grow.
          </p>
        </div>
        <div className="foundation-grid">
          {foundations.map(({ icon: Icon, title, text }) => (
            <article key={title}>
              <Icon size={25} />
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="guide-section ownership">
        <div>
          <h2>You own the source</h2>
          <p>
            Generated source is MIT licensed and lives in your repository. You
            can use it commercially, choose another coding agent, or maintain it
            yourself.
          </p>
        </div>
        <div>
          <h3>Your app still needs your review</h3>
          <p>
            Starter authentication and tests are foundations. Check
            authorization, security, accessibility, and reliability for your own
            use. Replacing a provider or library may require engineering work.
          </p>
          <p>
            Disposabl is intended for new apps using its TypeScript and Convex
            foundation. An existing app or a project that needs a different
            backend may be better served by its own setup.
          </p>
        </div>
      </section>
    </>
  );
}
export function GuidePage({ kind }: { kind: "build" | "why" | "stack" }) {
  return (
    <MarketingShell>
      <main id="main" className="launch-container guide-main">
        {kind === "stack" ? (
          <StackPage />
        ) : kind === "build" ? (
          <BuildPage />
        ) : (
          <WhyPage />
        )}
      </main>
    </MarketingShell>
  );
}
