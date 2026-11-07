import { useHydrated } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import {
  platforms,
  resolvePlatforms,
  type Platform,
} from "@disposabl/disposabl-kit/platforms";
import { AgentOnboarding } from "../agent-onboarding";
import { MarketingShell } from "./shell";
import { Pricing, Questions } from "./sections";
import { BrandIcon } from "./brand-icon";
import { AppPlayground, appIdeas } from "./playground";
import { Foundation } from "./foundation";
import { LanguageCloud } from "./languages";
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
          <div className="launch-container hero-studio">
            <h1 id="hero-title">
              Make your app.
              <br />
              <em>For free.</em>
            </h1>
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
                placeholder="What do you want to make?"
                rows={2}
              />
              <div className="hero-composer-actions">
                <button
                  id="start"
                  disabled={!hydrated}
                  type="submit"
                  className="primary-link"
                >
                  Start free <ArrowUpRight size={22} />
                </button>
              </div>
            </form>
            <StoreButtons />
            <div
              className="hero-platforms"
              aria-label="Build for these platforms"
            >
              {[
                ["Web", "Web"],
                ["Apple", "iPhone, iPad & Mac"],
                ["Android", "Android"],
                ["Windows", "Windows"],
                ["Linux", "Linux"],
              ].map(([icon, label]) => (
                <span
                  key={label}
                  className="hero-platform"
                  role="img"
                  aria-label={label}
                  tabIndex={0}
                >
                  <BrandIcon name={icon} />
                  <span role="tooltip">{label}</span>
                </span>
              ))}
            </div>
          </div>
        </section>
        <AppPlayground onUseIdea={useIdea} />
        <Foundation />
        <Pricing onStart={start} disabled={!hydrated} />
        <LanguageCloud />
        <Questions />
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
              <span>{name}</span>
            </button>
            <span
              id={`store-tip-${index}`}
              role="tooltip"
              className="store-tooltip"
            >
              Coming soon.
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
