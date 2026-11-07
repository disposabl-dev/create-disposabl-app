import { ArrowUpRight, Check, Plus } from "lucide-react";
import { TextLink } from "./shell";
import { BuildEvidence } from "./build-evidence";

export function BuildJourney() {
  return (
    <section
      className="journey-section launch-container"
      aria-labelledby="journey-title"
    >
      <div className="section-heading section-heading-split">
        <div>
          <p className="eyebrow">FROM “WHAT IF” TO “IT WORKS”</p>
          <h2 id="journey-title">
            Build time.
            <br />
            <span>Less mystery.</span>
          </h2>
        </div>
        <p>
          Getting a preview and shipping an app are different milestones. Here's
          what to expect at each step.
        </p>
      </div>
      <ol className="journey-steps">
        {[
          [
            "01",
            "Set up your project",
            "One guided setup",
            "Choose platforms, connect GitHub and Convex, and install dependencies. First-time account setup adds time.",
          ],
          [
            "02",
            "See your first preview",
            "Local dev, live feedback",
            "Start the web app with bun run dev. Your agent builds features and you check them as you go.",
          ],
          [
            "03",
            "Build for the device",
            "Native compilation varies",
            "Mobile and desktop need their toolchains. Cold builds take longer; caches help repeat builds.",
          ],
          [
            "04",
            "Share it with the world",
            "Release on your terms",
            "Deploy web changes or package native apps. Signing, hosted queues, and store review add separate time.",
          ],
        ].map(([number, title, time, description]) => (
          <li key={number}>
            <span className="step-number">{number}</span>
            <h3>{title}</h3>
            <span className="step-time">{time}</span>
            <p>{description}</p>
          </li>
        ))}
      </ol>
      <BuildEvidence />
      <div className="journey-note">
        <p>
          No universal stopwatch: scope, hardware, dependencies, and provider
          queues determine your build time.
        </p>
        <TextLink href="/build">Read the practical build guide</TextLink>
      </div>
    </section>
  );
}

export function Pricing() {
  return (
    <section
      id="pricing"
      className="pricing-section"
      aria-labelledby="pricing-title"
    >
      <div className="launch-container">
        <div className="section-heading">
          <p className="eyebrow">MAKE MORE. COMMIT TO LESS.</p>
          <h2 id="pricing-title">
            Your ambition.
            <br />
            <span>Not another subscription.</span>
          </h2>
          <p>
            Build locally for free. Credit pricing for Agent Mode is coming
            soon.
          </p>
        </div>
        <div className="pricing-grid">
          <article className="price-card local-price">
            <div className="price-kicker">
              ON YOUR COMPUTER <span>YOURS TO KEEP</span>
            </div>
            <h3>Local mode</h3>
            <p className="price-number">
              $0<span> / forever</span>
            </p>
            <p className="price-description">
              Everything you need to start.
              <br />
              No Disposabl usage meter.
            </p>
            <ul>
              {[
                "All supported platforms",
                "Your coding agent and your machine",
                "Full source code under the MIT license",
                "Starter tests and release workflows",
                "Unlimited local editing and builds",
              ].map((text) => (
                <li key={text}>
                  <Check size={16} />
                  {text}
                </li>
              ))}
            </ul>
            <a className="primary-link" href="#start">
              Start building free <ArrowUpRight size={18} />
            </a>
            <p className="price-footnote">
              AI, cloud providers, signing, and app store accounts may have
              their own costs.
            </p>
          </article>
          <article className="price-card agent-price">
            <div className="price-kicker">
              ON A SANDBOX <span>PLANNED PRICING</span>
            </div>
            <h3>Agent Mode</h3>
            <p className="price-number">
              $1<span> = 100 credits</span>
            </p>
            <p className="price-description">
              Give the heavier work
              <br />
              room to run.
            </p>
            <ul>
              {[
                "Run tasks in a remote sandbox",
                "Work through complex changes",
                "Iterate, test, and improve a result",
                "Explore approaches in parallel previews",
                "Compare results with your agent",
              ].map((text) => (
                <li key={text}>
                  <Check size={16} />
                  {text}
                </li>
              ))}
            </ul>
            <TextLink href="/build#agent-mode">Understand Agent Mode</TextLink>
            <p className="price-footnote">
              Credit billing is coming soon. No subscription planned. Task costs
              will vary. Parallel previews are agent-directed; a credit is not a
              fixed number of prompts or apps.
            </p>
          </article>
        </div>
        <div className="pricing-bottom">
          <span>No monthly plan. No platform upgrade tiers.</span>
          <a href="#faq">
            What does “free” include? <ArrowUpRight size={14} />
          </a>
        </div>
      </div>
    </section>
  );
}

export const faqs = [
  [
    "Is Disposabl really free?",
    "Local mode is free, including the starter, supported platforms, source code, and local builds. Your coding agent, model API, cloud backend, hosted builds, and store developer accounts may charge separately. Planned Agent Mode pricing is $1 = 100 credits, with no subscription. Credit billing is coming soon.",
  ],
  [
    "Why use this if I already have Claude Code or Codex?",
    "Keep using it. Disposabl gives your coding agent a connected TypeScript project, platform configuration, a shared backend, starter tests, and release workflows. Your agent can spend more time on your app's behavior. You can also assemble those pieces yourself; Disposabl provides a starting point you can inspect and change.",
  ],
  [
    "Do I need to know how to code?",
    "You can start by describing an idea to your coding agent. It can guide setup and implementation. You will still connect accounts, make product decisions, review changes, and test the result. Publishing native apps also involves signing and store requirements. It helps to be comfortable following terminal instructions.",
  ],
  [
    "Does one project mean the same interface on every platform?",
    "The platforms share a backend and TypeScript conventions. Web uses React; mobile uses React Native and Expo; desktop packages the web experience with Electron. Your agent still builds and tests the right interface for each platform. Disposabl does not automatically turn every web component into a native mobile screen.",
  ],
  [
    "How long will my app take to build?",
    "There is no honest single number for every app. Setup depends on accounts, downloads, and your machine. Feature development depends on scope and your agent. Native compilation, signing, hosted queues, and store review take additional time. Start with one useful workflow, verify it, then expand. Our build guide separates these stages.",
  ],
  [
    "Is local mode completely offline?",
    "No. Your code and development tools run on your computer, while setup connects your GitHub and Convex accounts. The standard backend runs on Convex. Hosted AI models, provider setup, and publishing also need internet access. Local refers to where development runs, not an offline promise.",
  ],
  [
    "What does Agent Mode do, and how do credits work?",
    "Agent Mode runs work remotely in a sandbox. It suits longer tasks and repeated improvement: build an approach, test it, compare alternatives, and refine. Agents can use parallel previews to compare results; this is not a guarantee of automatic quality ranking. Planned pricing is $1 = 100 credits, with no subscription. Credit billing is coming soon. Consumption will vary by task rather than a fixed price per app.",
  ],
  [
    "Can I build an app for my business?",
    "Yes. You can use the MIT-licensed source for personal and commercial projects. The starter provides foundations, not a security certification or a guarantee of compliance. Your team remains responsible for access rules, data handling, reliability, and testing the behavior your business needs.",
  ],
  [
    "Can I leave Disposabl later?",
    "Yes. Your project is source code in your repository. You can modify it, work with another agent, and maintain it yourself. Your app still depends on its chosen libraries and providers; moving away from a backend such as Convex would require migration work.",
  ],
  [
    "Are the mobile builder and 85+ languages available now?",
    "Not yet. The Disposabl mobile builder's App Store and Google Play links are placeholders marked Coming soon. The planned General Translation integration for 85+ languages is also coming soon. You can already create iOS and Android app projects from your computer.",
  ],
];

export function Questions() {
  return (
    <section
      id="faq"
      className="faq-section launch-container"
      aria-labelledby="faq-title"
    >
      <div>
        <p className="eyebrow">GOOD QUESTIONS.</p>
        <h2 id="faq-title">
          Straight
          <br />
          <span>answers.</span>
        </h2>
        <p>
          The details matter.
          <br />
          Especially before you build.
        </p>
        <TextLink href="https://github.com/disposabl-dev/create-disposabl-app/issues">
          Ask us on GitHub
        </TextLink>
      </div>
      <div className="faq-list">
        {faqs.map(([question, answer]) => (
          <details key={question}>
            <summary>
              {question}
              <Plus size={18} aria-hidden="true" />
            </summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
