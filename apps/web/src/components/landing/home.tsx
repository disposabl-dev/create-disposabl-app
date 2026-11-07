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
import { AppPlayground, appIdeas } from "./playground";
import { Foundation } from "./foundation";
import "./home.css";

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
      const sharedIdea = new URLSearchParams(window.location.search).get(
        "idea",
      );
      const example = appIdeas.find((item) => item.id === sharedIdea);
      if (example) setDraft(example.prompt);
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
        <section className="maker-hero" aria-labelledby="hero-title">
          <div className="launch-container maker-hero-grid">
            <div className="maker-statement">
              <h1 id="hero-title">
                Make your
                <br />
                own app.
                <br />
                <em>For free.</em>
              </h1>
              <p>Build with your AI, on your computer. Keep the code.</p>
            </div>
            <div className="maker-entry">
              <h2>Your idea starts here.</h2>
              <p>
                Get a starting prompt for your AI.
                <br />
                Make the app you have in mind.
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
                  placeholder="I want an app that…"
                  rows={3}
                />
                <button
                  id="start"
                  disabled={!hydrated}
                  type="submit"
                  className="primary-link"
                >
                  Get started free <ArrowUpRight size={22} />
                </button>
              </form>
              <div className="hero-local">
                <span className="local-dot" />
                Free local builds. Your AI. Your code.
              </div>
              <StoreButtons />
            </div>
          </div>
          <div
            className="hero-platforms launch-container"
            aria-label="Build for these platforms"
          >
            <span>One idea. Everywhere.</span>
            <div>
              {[
                ["Web", "Web"],
                ["Apple", "iOS"],
                ["Android", "Android"],
                ["macOS", "macOS"],
                ["Windows", "Windows"],
                ["Linux", "Linux"],
              ].map(([icon, label]) => (
                <span key={label}>
                  <BrandIcon name={icon} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </section>
        <AppPlayground onUseIdea={useIdea} />
        <Foundation />
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
              <span>Your code.</span>
            </h2>
            <TextLink href="/why-disposabl">Why build with Disposabl?</TextLink>
          </div>
          <div className="ownership-details">
            <article>
              <h3>Already paying for AI? Use it.</h3>
              <p>
                Bring Claude Code, Codex, Cursor, or another coding agent. Local
                mode adds no Disposabl subscription or credit meter.
              </p>
            </article>
            <article>
              <h3>Make one app. Or a hundred.</h3>
              <p>
                A tool for yourself, a home for your community, a product to
                sell. Every supported platform is included.
              </p>
            </article>
            <article>
              <h3>You can take it with you.</h3>
              <p>
                Your source lives in your own repository. Keep building, switch
                agents, hire a team. You choose what happens next.
              </p>
            </article>
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
          <p>More people should get to make software in their own words.</p>
        </section>
        <Questions />
        <section className="final-section launch-container">
          <h2>You know what’s missing. Make it.</h2>
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
            Make your app <ArrowRight size={20} />
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
