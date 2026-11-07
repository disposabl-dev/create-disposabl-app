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
import { StartActions } from "./start-actions";
import { HeroPreview } from "./hero-preview";
import { AgentWorkspace } from "./agent-workspace";
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
  const [idea, setIdea] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const openFromLink = () => {
      const sharedIdea = new URLSearchParams(window.location.search).get(
        "idea",
      );
      const example = appIdeas.find((item) => item.id === sharedIdea);
      if (example) setIdea(example.prompt);
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
  const start = () => dialog.current?.showModal();
  const useIdea = (value: string) => {
    setIdea(value);
    dialog.current?.showModal();
  };
  return (
    <MarketingShell onStart={start}>
      <main id="main" className="launch-home">
        <section className="maker-hero" aria-labelledby="hero-title">
          <div className="launch-container workshop-hero">
            <div className="hero-message">
              <h1 id="hero-title">
                That should
                <br />
                be an <span>app.</span>
              </h1>
              <p className="hero-promise">
                Make it with your AI.
                <br />
                <strong>Free on your computer.</strong>
              </p>
              <StartActions onDetails={start} />
            </div>
            <HeroPreview />
          </div>
          <div className="platform-ribbon launch-container">
            <p>Web. Mobile. Desktop.</p>
            <div aria-label="Supported platforms">
              {["Web", "Apple", "Android", "Windows", "Linux"].map((name) => (
                <span
                  key={name}
                  role="img"
                  aria-label={name === "Apple" ? "iPhone, iPad and Mac" : name}
                  title={name === "Apple" ? "iPhone, iPad and Mac" : name}
                >
                  <BrandIcon name={name} />
                </span>
              ))}
            </div>
            <a href="/stack">
              See what's included <ArrowUpRight size={18} />
            </a>
          </div>
        </section>
        <AppPlayground onUseIdea={useIdea} />
        <Foundation />
        <AgentWorkspace />
        <Pricing onStart={start} disabled={!hydrated} />
        <LanguageCloud />
        <Questions />
        <section
          className="closing-start launch-container"
          aria-labelledby="closing-title"
        >
          <h2 id="closing-title">
            You know that app
            <br />
            you keep thinking about?
          </h2>
          <div>
            <p>Make it yours.</p>
            <StartActions onDetails={start} closing />
          </div>
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
