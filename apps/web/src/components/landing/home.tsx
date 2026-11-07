import { useHydrated } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, X } from "lucide-react";
import {
  platforms,
  resolvePlatforms,
  type Platform,
} from "@disposabl/disposabl-kit/platforms";
import { AgentOnboarding } from "../agent-onboarding";
import { MarketingShell, TextLink } from "./shell";
import { Pricing, Questions } from "./sections";
import { BrandIcon } from "./brand-icon";
import { AppWalkthrough } from "./walkthrough";
import "./home.css";

const ideas = [
  [
    "A booking app",
    "An app for my business where customers can choose a service, pick a time, and book an appointment.",
  ],
  [
    "A personal planner",
    "A personal planner for my tasks, routines, and weekly goals. I want to see what matters today and keep track of my progress.",
  ],
  [
    "A team workspace",
    "A workspace where my team can organize projects, assign tasks, and share updates. Each person should only see the projects they can access.",
  ],
];

export function Home() {
  const hydrated = useHydrated();
  const [selected, setSelected] = useState<Platform[]>([
    "web",
    "android",
    "ios",
  ]);
  const [draft, setDraft] = useState("");
  const [idea, setIdea] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const openFromLink = () => {
      const requested = new URLSearchParams(window.location.search)
        .get("platforms")
        ?.split(",");
      if (requested?.length) {
        const valid = requested.filter((id): id is Platform =>
          platforms.some((p) => p.id === id),
        );
        if (valid.length) setSelected(resolvePlatforms(valid));
      }
      if (window.location.hash === "#start") dialog.current?.showModal();
    };
    openFromLink();
    window.addEventListener("hashchange", openFromLink);
    return () => window.removeEventListener("hashchange", openFromLink);
  }, []);
  const start = () => {
    setIdea(draft.trim());
    dialog.current?.showModal();
  };
  const useIdea = (value: string) => {
    setDraft(value);
    field.current?.focus();
    field.current?.scrollIntoView({ behavior: "auto", block: "center" });
  };
  return (
    <MarketingShell onStart={start}>
      <main id="main" className="launch-home">
        <section
          className="launch-hero launch-container"
          aria-labelledby="hero-title"
        >
          <h1 id="hero-title">
            Build an app
            <br />
            of your own<span className="hero-period">.</span>
          </h1>
          <p className="hero-description">
            Free app building for the web,
            <br />
            phones, and computers.
          </p>
          <form
            className="idea-composer"
            onSubmit={(event) => {
              event.preventDefault();
              start();
            }}
          >
            <label className="sr-only" htmlFor="app-idea">
              Describe your app
            </label>
            <textarea
              disabled={!hydrated}
              id="app-idea"
              ref={field}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={2000}
              placeholder="What would you like your app to do?"
              rows={2}
            />
            <div className="idea-composer-actions">
              <span>Free on your computer</span>
              <button
                id="start"
                disabled={!hydrated}
                type="submit"
                className="primary-link"
              >
                Start with your AI <ArrowRight size={20} />
              </button>
            </div>
          </form>
          <StoreButtons />
          <div
            className="idea-suggestions"
            role="group"
            aria-label="Try an app idea"
          >
            {ideas.map(([title, prompt]) => (
              <button
                type="button"
                disabled={!hydrated}
                key={title}
                onClick={() => useIdea(prompt)}
              >
                {title}
                <ArrowUpRight size={16} />
              </button>
            ))}
          </div>
        </section>
        <AppWalkthrough onUseIdea={useIdea} />
        <section
          className="ownership-section launch-container"
          aria-labelledby="ownership-title"
        >
          <div className="ownership-heading">
            <h2 id="ownership-title">
              Your AI.
              <br />
              Your computer.
              <br />
              Your code.
            </h2>
            <TextLink href="/why-disposabl">Why build with Disposabl?</TextLink>
          </div>
          <div className="ownership-details">
            <article>
              <h3>Start with the parts connected.</h3>
              <p>
                Sign-in, saved data, tests, and publishing are ready for your AI
                to build on. Spend your time making the app useful.
              </p>
            </article>
            <article>
              <h3>Use the AI you choose.</h3>
              <p>
                Work with Claude Code, Codex, Cursor, or another coding agent.
                Disposabl gives it a complete starting point.
              </p>
            </article>
            <article>
              <h3>Keep what you make.</h3>
              <p>
                Your project lives in your own account. Change it, share it, or
                build a business with it. The code is yours.
              </p>
            </article>
          </div>
        </section>
        <section
          className="devices-section launch-container"
          aria-labelledby="devices-title"
        >
          <div>
            <h2 id="devices-title">Wherever you need it.</h2>
            <p>
              Build for a browser, a phone, or a desktop.
              <br />
              Choose your platforms when you start.
            </p>
          </div>
          <div className="device-list">
            {[
              ["Web", "Web"],
              ["Apple", "iPhone & iPad"],
              ["Android", "Android"],
              ["macOS", "Mac"],
              ["Windows", "Windows"],
              ["Linux", "Linux"],
            ].map(([icon, label]) => (
              <span key={label}>
                <BrandIcon name={icon} />
                {label}
              </span>
            ))}
          </div>
        </section>
        <Pricing onStart={start} disabled={!hydrated} />
        <section
          className="language-section launch-container"
          aria-labelledby="language-title"
        >
          <h2 id="language-title">
            85+ languages.
            <br />
            Coming soon.
          </h2>
          <div className="language-art" aria-hidden="true">
            <span>Hello</span>
            <span>こんにちは</span>
            <span>Hola</span>
            <span>नमस्ते</span>
          </div>
        </section>
        <Questions />
        <section className="final-section launch-container">
          <h2>What will your app do?</h2>
          <button
            className="primary-link"
            disabled={!hydrated}
            onClick={() => {
              field.current?.focus();
              field.current?.scrollIntoView({
                behavior: "auto",
                block: "center",
              });
            }}
          >
            Start with an idea <ArrowRight size={20} />
          </button>
        </section>
      </main>
      <dialog
        className="start-dialog"
        ref={dialog}
        aria-labelledby="start-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className="dialog-heading">
          <h2 id="start-title">Continue with your AI.</h2>
          <button
            autoFocus
            aria-label="Close start dialog"
            onClick={() => dialog.current?.close()}
          >
            <X size={22} />
          </button>
        </div>
        <p className="dialog-intro">
          Paste this into your coding agent to set up your app on your computer.
        </p>
        <AgentOnboarding key={idea} idea={idea} platforms={selected} />
        <a className="dialog-help" href="/build">
          New to coding agents? See how to start <ArrowUpRight size={18} />
        </a>
      </dialog>
    </MarketingShell>
  );
}

function StoreButtons() {
  return (
    <div className="store-group">
      <span>Mobile app coming soon</span>
      <div className="store-buttons">
        {["App Store", "Google Play"].map((name, index) => (
          <div className="store-control" key={name}>
            <button
              type="button"
              aria-disabled="true"
              aria-describedby={`store-tip-${index}`}
              className="store-button"
              onClick={(event) => event.currentTarget.focus()}
              aria-label={
                index === 0
                  ? "Download on the App Store"
                  : "Get it on Google Play"
              }
            >
              <BrandIcon name={index === 0 ? "Apple" : "Google Play"} />
            </button>
            <span
              id={`store-tip-${index}`}
              role="tooltip"
              className="store-tooltip"
            >
              Coming soon. Build from your computer today.
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
