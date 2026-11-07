import { ArrowUpRight, Check, Plus } from "lucide-react";
import { TextLink } from "./shell";

export function Pricing({ onStart }: { onStart: () => void }) {
  return (
    <section
      id="pricing"
      className="pricing-section"
      aria-labelledby="pricing-title"
    >
      <div className="launch-container">
        <div className="section-heading">
          <h2 id="pricing-title">Build freely.</h2>
          <p>No subscriptions. No platform upgrade tiers.</p>
        </div>
        <div className="pricing-grid">
          <article className="price-card local-price">
            <h3>On your computer</h3>
            <p className="price-number">
              Free<span>forever</span>
            </p>
            <p>Your AI. All platforms. All your code.</p>
            <ul>
              {[
                "Unlimited local editing and builds",
                "MIT-licensed source you can keep",
                "Tests and release workflows included",
              ].map((text) => (
                <li key={text}>
                  <Check size={16} />
                  {text}
                </li>
              ))}
            </ul>
            <button onClick={onStart} className="primary-link">
              Start building <ArrowUpRight size={17} />
            </button>
            <p className="price-footnote">
              Your AI and cloud providers may charge separately.
            </p>
          </article>
          <article className="price-card agent-price">
            <div className="price-title">
              <h3>Agent Mode</h3>
              <span className="planned-label">Planned pricing</span>
            </div>
            <p className="price-number">
              $1<span>= 100 credits</span>
            </p>
            <p>Remote sandboxes for the bigger jobs.</p>
            <ul>
              {[
                "Work through complex tasks",
                "Iterate, test, and improve",
                "Compare approaches in parallel previews",
              ].map((text) => (
                <li key={text}>
                  <Check size={16} />
                  {text}
                </li>
              ))}
            </ul>
            <TextLink href="/build#agent-mode">How Agent Mode works</TextLink>
            <p className="price-footnote">
              Credit billing is coming soon. No subscription planned. Usage
              varies by task.
            </p>
          </article>
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
    "Our November 4 CI run took 1m 40s for web, 29m 22s for Android, and 26m 39s for an iOS simulator build. These are different workloads, not time-to-finished-app estimates. Setup, feature development, queues, and store review add time. See the build guide for the exact runs.",
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
      <h2 id="faq-title">Good questions.</h2>
      <div className="faq-list">
        {faqs.map(([question, answer]) => (
          <details key={question}>
            <summary>
              {question}
              <Plus size={19} aria-hidden="true" />
            </summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
      <TextLink href="/build#build-times">
        Build times and publishing guide
      </TextLink>
    </section>
  );
}
