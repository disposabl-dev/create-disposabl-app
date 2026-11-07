import { ArrowUpRight } from "lucide-react";
import { MarketingShell, repository } from "./shell";
import { stackGroups } from "./platform-explorer";
import { BuildEvidence } from "./build-evidence";
import "./home.css";

type Section = {
  id: string;
  title: string;
  paragraphs: string[];
  code?: string;
  items?: string[];
};
const buildSections: Section[] = [
  {
    id: "setup",
    title: "01. Set up once. Know what you're connecting.",
    paragraphs: [
      "Install Bun, Git, and Node.js 24.8 or newer. Run the command below, choose a project name, then select the platforms you need. Web and the shared backend are included.",
      "Setup asks you to sign in to Disposabl and connect your GitHub and Convex accounts. Mobile projects also need an Expo account. Your code lives in your GitHub repository. This is local development with connected services, so setup needs internet access.",
    ],
    code: "bunx create-disposabl-app@latest",
  },
  {
    id: "preview",
    title: "02. Get a preview. Build one useful thing.",
    paragraphs: [
      "Open the new project and run its development command. This starts the local website and connects it to your development backend. Replace my-app with the project name you chose.",
      "Ask your coding agent to build a complete, small workflow first. For a meal planner, that could mean adding a meal, seeing it on the calendar, and finding it still there after a reload. Expand after that works.",
    ],
    code: "cd my-app\nbun run dev",
  },
  {
    id: "build-times",
    title: "03. Understand the clock.",
    paragraphs: [
      "A first setup includes account authorization, downloads, installation, and backend configuration. Your first preview follows that setup. Feature development has its own timeline, determined by scope, model behavior, and the fixes your tests uncover.",
      "A native build compiles and packages code. Cold builds and new dependencies can take longer than cached rebuilds. iOS needs macOS and Xcode; Android needs its SDK. Desktop build and signing requirements depend on the target operating system.",
      "We don't publish a universal minutes-per-app claim. For a useful benchmark, record the machine, platform, project size, cold or cached state, and whether the number includes setup, queueing, and signing. Compare the same workload.",
    ],
    items: [
      "Setup time: accounts, downloads, and dependencies.",
      "Iteration time: build a feature, inspect it, and test it.",
      "Compilation time: package the exact target app.",
      "Delivery time: signing, uploads, release queues, and store review.",
    ],
  },
  {
    id: "testing",
    title: "04. A build is a beginning. Test the behavior.",
    paragraphs: [
      "Starter checks live in packages/tests, separate from application code. The test command follows the platforms in disposabl.json. Backend checks always apply; API checks apply when API is selected.",
      "Use a development or isolated preview backend. Mobile tests need a locally built app installed on a simulator or emulator. The starter tests are a baseline; ask your agent to add checks for your real workflows, including login, permissions, and persistence.",
    ],
    code: "bun run test\n# Or scope a local check:\nbun run test --target web,backend",
  },
  {
    id: "publishing",
    title: "05. Share a preview. Then ship deliberately.",
    paragraphs: [
      "Your project includes GitHub workflows for previews and releases. Connect the appropriate providers and configure secrets and signing credentials in your own accounts. Hosted build usage can incur provider charges.",
      "Web deployment, an Android installer, an iOS distribution build, and a signed desktop installer are separate outcomes. Verify the app on the target device. Store submission and approval are additional steps, not a promise made by a successful build.",
      "Before a business launch, review authentication, authorization, data handling, recovery, and operational monitoring. Disposabl supplies foundations you can inspect. It does not certify the application you build.",
    ],
  },
  {
    id: "agent-mode",
    title: "When the work needs more room.",
    paragraphs: [
      "Local mode uses your machine and your coding agent. Agent Mode runs work in a remote sandbox. Planned credit pricing is $1 = 100 credits, with no subscription. Credit billing is coming soon. Task consumption will vary; credits are not a fixed price per prompt or completed app.",
      "Use it for longer changes, debugging loops, or comparing several approaches. An agent can create parallel previews, run checks, inspect the results, and improve the most promising version. This repeated build-test-improve process is sometimes called hill climbing.",
      "Parallel previews are agent-directed. They don't guarantee independent sandboxes, automatic scoring, or a better result. Give the agent a concrete success condition and review the evidence before accepting a change. Remote sandbox work also sends project context outside your computer.",
    ],
  },
];
const whySections: Section[] = [
  {
    id: "together",
    title: "Your coding agent stays in the picture.",
    paragraphs: [
      "Claude Code, Codex, Cursor, and other coding agents can build applications. Disposabl gives them a starting point with connected parts: a TypeScript project, platform configuration, a shared backend, tests, and release workflows.",
      "The value is in the setup you don't need to describe and connect again. You can read the source, change the choices, and keep working with the agent you prefer. Disposabl is not a model subscription or a replacement for your coding agent.",
    ],
  },
  {
    id: "foundation",
    title: "Start closer to the interesting part.",
    paragraphs: [
      "Imagine building a booking tool for a neighborhood workshop. The interesting parts are availability, reservations, and the experience for hosts and guests. Before those work, you need somewhere to store bookings, a way to sign in, interfaces for the devices you choose, and a way to test the workflow.",
      "Disposabl sets up the connected foundation. Your agent builds the booking rules and screens. You decide who can access each booking, test the behavior, and choose when to release.",
    ],
    items: [
      "Web: React, TanStack Start, Vite, and Tailwind CSS.",
      "Mobile: React Native and Expo projects for iOS and Android.",
      "Desktop: Electron packaging for the web experience.",
      "Shared backend: Convex data and server functions.",
      "Delivery: starter tests and GitHub release workflows.",
    ],
  },
  {
    id: "fit",
    title: "When it fits. When to start elsewhere.",
    paragraphs: [
      "Disposabl fits when you want a new app across supported platforms, are comfortable with its TypeScript and Convex foundation, and want ownership of a real repository. A personal tool and a commercial app can start here.",
      "If you're extending an established codebase with different infrastructure, keeping that architecture may be simpler. If your product requires a specific native engine or a different backend, weigh the migration and integration work before choosing the starter. A static page may need much less machinery.",
    ],
  },
  {
    id: "ownership",
    title: "Ownership includes responsibility.",
    paragraphs: [
      "Generated source is MIT licensed and lives in your repository. You can build commercially, switch coding agents, and maintain it yourself. You still depend on the libraries and providers you use; replacing them can require engineering work.",
      "Authentication plumbing and starter tests are useful foundations. Your application's authorization, security, accessibility, compliance, and reliability need review for its specific use. An enterprise deployment earns trust through verified behavior, not a badge on a landing page.",
    ],
  },
];

export function GuidePage({ kind }: { kind: "build" | "why" | "stack" }) {
  const sections =
    kind === "build"
      ? buildSections
      : kind === "why"
        ? whySections
        : stackGroups.map((group) => ({
            id: group.id,
            title: group.label,
            paragraphs: [group.description, group.note],
            items: group.stack,
            code: group.path,
          }));
  const content =
    kind === "build"
      ? {
          eyebrow: "A PRACTICAL BUILD GUIDE",
          title: (
            <>
              From first command
              <br />
              to <span>“look what I made.”</span>
            </>
          ),
          intro:
            "Know what happens between an idea and a working app. No magic stopwatch. Just a clear path.",
        }
      : kind === "why"
        ? {
            eyebrow: "YOUR AGENT + DISPOSABL",
            title: (
              <>
                Keep your AI.
                <br />
                <span>Skip the repeat setup.</span>
              </>
            ),
            intro:
              "A connected starting point for the coding agent you already use. Here's what it gives you, and what stays in your hands.",
          }
        : {
            eyebrow: "OPEN SOURCE. OPEN THE HOOD.",
            title: (
              <>
                Good software.
                <br />
                <span>Familiar ingredients.</span>
              </>
            ),
            intro:
              "A TypeScript project built from tools you can inspect, learn, and replace. Choose platforms on the home page; explore their foundations here.",
          };
  return (
    <MarketingShell>
      <main id="main" className="launch-container guide-main">
        <header className="guide-hero">
          <a className="guide-back" href="/">
            ← Back to Disposabl
          </a>
          <p className="eyebrow">{content.eyebrow}</p>
          <h1>{content.title}</h1>
          <p className="guide-intro">{content.intro}</p>
        </header>
        <div className="guide-layout">
          <nav className="guide-index" aria-label="On this page">
            <span>ON THIS PAGE</span>
            {sections.map((section) => (
              <a key={section.id} href={`#${section.id}`}>
                {section.title.replace(/^\d+\. /, "")}
              </a>
            ))}
            <a href="/#start" className="guide-start">
              Start building <ArrowUpRight size={14} />
            </a>
          </nav>
          <div className="guide-article">
            {sections.map((section) => (
              <section key={section.id} id={section.id}>
                <h2>{section.title}</h2>
                {section.id === "build-times" && <BuildEvidence />}
                {section.paragraphs.map((p) => (
                  <p key={p}>{p}</p>
                ))}
                {section.items && (
                  <ul>
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
                {section.code && (
                  <pre>
                    <code>{section.code}</code>
                  </pre>
                )}
              </section>
            ))}
            {kind === "stack" && (
              <section id="shared">
                <h2>The parts they share.</h2>
                <p>
                  Convex supplies the database, server functions, and live
                  updates. Bun installs dependencies; Turborepo coordinates
                  project commands. Optional authentication uses Convex Auth.
                  Tests use TesterArmy E2E, with checks kept outside application
                  bundles.
                </p>
                <p>
                  All platforms use TypeScript conventions and a shared backend.
                  Mobile screens use React Native, while Electron packages the
                  web experience. This is not a promise of one identical UI
                  component working everywhere.
                </p>
              </section>
            )}
            <aside className="guide-end">
              <h2>Your next step is small.</h2>
              <p>
                Start with one useful workflow. Make it work, test it, then make
                it yours.
              </p>
              <a className="primary-link" href="/#start">
                Create your project <ArrowUpRight size={18} />
              </a>
              <a className="text-link" href={`${repository}#readme`}>
                Read the source README <ArrowUpRight size={15} />
              </a>
            </aside>
          </div>
        </div>
      </main>
    </MarketingShell>
  );
}
