import { ArrowUpRight, Check, Plus } from "lucide-react";
import { TextLink } from "./shell";
import {
  creditQuantity,
  formatPrice,
  pricing,
} from "../../../../../packages/disposabl-kit/payments/config";

export function Pricing({
  onStart,
  disabled,
}: {
  onStart: () => void;
  disabled: boolean;
}) {
  return (
    <section
      id="pricing"
      className="pricing-section"
      aria-labelledby="pricing-title"
    >
      <div className="launch-container">
        <h2 id="pricing-title">Pricing</h2>
        <div className="pricing-grid">
          <article className="price-card local-price">
            <h3>On your computer</h3>
            <p className="price-number">Free</p>
            <ul>
              {[
                "Unlimited app projects",
                "Every platform included",
                "Your AI, computer, and code",
                "Personal and business use",
                "AI and cloud costs billed separately",
              ].map((text) => (
                <li key={text}>
                  <Check size={20} />
                  {text}
                </li>
              ))}
            </ul>
            <button
              disabled={disabled}
              onClick={onStart}
              className="primary-link"
            >
              Start building
              <ArrowUpRight size={20} />
            </button>
          </article>
          <article className="price-card agent-price">
            <h3>Agent Mode</h3>
            <p className="price-number">{formatPrice(pricing.topup.price)}</p>
            <ul>
              {[
                `${creditQuantity("topup")} credits`,
                "10 credits per 10-minute compute window",
                "AI currently included",
                "Work on a remote computer",
                "Longer tasks and refinements",
                "Compare versions side by side",
                "One-time purchase, credits do not expire",
              ].map((text) => (
                <li key={text}>
                  <Check size={20} />
                  {text}
                </li>
              ))}
            </ul>
            <TextLink href="/pricing">See all pricing</TextLink>
          </article>
        </div>
      </div>
    </section>
  );
}

export const faqs = [
  [
    "Is Disposabl really free?",
    `Local mode is free, including the starter, supported platforms, source code, and local builds. Your AI tools, hosting, and app store developer accounts may charge separately. Agent Mode offers ${creditQuantity("monthly")} credits for ${formatPrice(pricing.monthly.price)} per month, or a ${formatPrice(pricing.topup.price)} one-time purchase of ${creditQuantity("topup")} credits. Monthly credits expire; one-time credits do not.`,
  ],
  [
    "Why use this if I already have Claude Code or Codex?",
    "Keep using it. Disposabl connects the parts your app needs: sign-in, saved data, tests, and publishing. Your AI starts with those parts in place, so you can focus on what your app should do. You can inspect and change everything.",
  ],
  [
    "Do I need to know how to code?",
    "You can start by describing an idea to your coding agent. It can guide setup and implementation. You will still connect accounts, make product decisions, review changes, and test the result. Publishing native apps also involves signing and store requirements. Your coding agent can guide the technical steps. You will need to install it on your computer first.",
  ],
  [
    "Can I make a phone app and a website?",
    "Yes. Choose the devices you want to support. Your AI builds the screens for each one, with shared accounts and saved data. You still need to try the app on each device before publishing.",
  ],
  [
    "Can I make games too?",
    "Yes. Start with a small game for web, iOS, or Android: a puzzle, quiz, memory game, or turn-based game. Your AI can add touch controls, scores, and saved progress. Try the playable example above, then describe your own rules. Test the controls and performance on every device you plan to support.",
  ],
  [
    "How long will my app take to build?",
    "It depends on what you are making. A small first version is a useful place to start. Connecting accounts, building features, testing, and publishing each take time. Our build guide shows measured build times and explains what they include.",
  ],
  [
    "Is local mode completely offline?",
    "No. Your project runs on your computer, but your AI, saved data, account connections, and publishing can use online services. You need an internet connection for setup.",
  ],
  [
    "What does Agent Mode do, and how do credits work?",
    `Agent Mode runs tasks in one remote sandbox shared across your apps. Each 10-minute compute window is paid upfront with 10 credits while the agent is active. AI is currently included. If the next window cannot be funded, new work pauses. Add credits if needed, then send a new message to resume. Agent Mode offers ${creditQuantity("monthly")} credits for ${formatPrice(pricing.monthly.price)} per month, or ${creditQuantity("topup")} credits for ${formatPrice(pricing.topup.price)} once. Monthly credits expire; one-time credits do not.`,
  ],
  [
    "Can I build an app for my business?",
    "Yes. You can use the MIT-licensed source for personal and commercial projects. The starter provides foundations, not a security certification or a guarantee of compliance. Your team remains responsible for access rules, data handling, reliability, and testing the behavior your business needs.",
  ],
  [
    "Can I leave Disposabl later?",
    "Yes. Your project is source code in your repository. You can modify it, work with another agent, and maintain it yourself. Your app still uses the services you connected. Changing those services can take additional work.",
  ],
  [
    "Are the mobile builder and 85+ languages available now?",
    "Not yet. The Disposabl mobile builder's App Store and Google Play links are placeholders marked Coming soon. Support for 85+ languages is also coming soon. You can already create iOS and Android app projects from your computer.",
  ],
];

export function Questions() {
  return (
    <section
      id="faq"
      className="faq-section launch-container"
      aria-labelledby="faq-title"
    >
      <h2 id="faq-title">Questions, answered.</h2>
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
