import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Laptop, X } from "lucide-react";
import { type Platform } from "@disposabl/disposabl-kit/platforms";
import { AgentOnboarding } from "../agent-onboarding";
import { MarketingShell, TextLink } from "./shell";
import { PlatformExplorer } from "./platform-explorer";
import { Pricing, Questions } from "./sections";
import { BrandIcon } from "./brand-icon";
import { AppPreview } from "./app-preview";
import claude from "../agent-onboarding/assets/claude.svg";
import codex from "../agent-onboarding/assets/codex.png";
import cursor from "../agent-onboarding/assets/cursor.svg";
import "./home.css";

export function Home() {
  const [selected, setSelected] = useState<Platform[]>([
    "web",
    "android",
    "ios",
  ]);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const openFromLink = () => {
      if (window.location.hash === "#start") dialog.current?.showModal();
    };
    openFromLink();
    window.addEventListener("hashchange", openFromLink);
    return () => window.removeEventListener("hashchange", openFromLink);
  }, []);
  const start = () => dialog.current?.showModal();
  return (
    <MarketingShell onStart={start}>
      <main id="main" className="launch-home">
        <section
          className="launch-hero launch-container"
          aria-labelledby="hero-title"
        >
          <h1 id="hero-title">
            Build the app
            <br />
            <span>you wish existed.</span>
          </h1>
          <p className="hero-description">Your AI. Your computer. Your code.</p>
          <div className="hero-actions">
            <button
              id="start"
              className="primary-link"
              onClick={() => dialog.current?.showModal()}
            >
              <Laptop size={20} /> Start building free{" "}
              <ArrowUpRight size={18} />
            </button>
            <StoreButtons />
          </div>
          <p className="hero-cost">
            Free on your computer. No Disposabl subscription.
          </p>
          <div
            className="hero-platforms"
            aria-label="Build for web, mobile and desktop"
          >
            {["Web", "Apple", "Android", "Windows", "Linux"].map((name) => (
              <span key={name} title={name}>
                <BrandIcon name={name} />
                <span className="sr-only">{name}</span>
              </span>
            ))}
          </div>
          <AppPreview />
        </section>
        <PlatformExplorer selected={selected} onChange={setSelected} />
        <section
          className="agent-section launch-container"
          aria-labelledby="agent-title"
        >
          <div className="agent-pair" aria-hidden="true">
            <div className="agent-choice-icons">
              {[claude, codex, cursor].map((src, i) => (
                <img key={i} src={src} alt="" />
              ))}
            </div>
            <span>+</span>
            <img
              src="/disposabl-logo.svg"
              alt=""
              className="disposabl-pair-icon"
            />
          </div>
          <div>
            <h2 id="agent-title">
              Keep your favorite AI.
              <br />
              Skip the setup work.
            </h2>
            <p>
              Claude Code, Codex, Cursor. Give your agent a project with the
              platforms, backend, tests, and publishing already connected.
            </p>
            <TextLink href="/why-disposabl">Why use them together?</TextLink>
          </div>
        </section>
        <Pricing onStart={start} />
        <section
          className="language-section launch-container"
          aria-labelledby="language-title"
        >
          <div className="language-art" aria-hidden="true">
            <span>Hello</span>
            <span>こんにちは</span>
            <span>Hola</span>
            <span>नमस्ते</span>
          </div>
          <div>
            <h2 id="language-title">
              85+ languages.
              <br />
              Coming soon.
            </h2>
            <p>
              Localization with{" "}
              <a className="inline-link" href="https://generaltranslation.com/">
                General Translation
              </a>
              . Planned for the starter.
            </p>
          </div>
        </section>
        <Questions />
        <section className="final-section launch-container">
          <h2>What will you make?</h2>
          <button
            className="primary-link"
            onClick={() => dialog.current?.showModal()}
          >
            Start building free <ArrowUpRight size={18} />
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
          <h2 id="start-title">Let's build your app.</h2>
          <button
            autoFocus
            aria-label="Close start dialog"
            onClick={() => dialog.current?.close()}
          >
            <X size={22} />
          </button>
        </div>
        <AgentOnboarding />
        <p className="dialog-note">
          Local development is free. AI and cloud providers may charge
          separately.
        </p>
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
            >
              <BrandIcon name={index === 0 ? "Apple" : "Google Play"} />
              <span>
                <small>{index === 0 ? "Download on the" : "Get it on"}</small>
                {name}
              </span>
            </button>
            <span
              id={`store-tip-${index}`}
              role="tooltip"
              className="store-tooltip"
            >
              Coming soon. The Disposabl mobile app is on its way.
            </span>
          </div>
        ))}
      </div>
      <span className="store-status">Mobile builder coming soon</span>
    </div>
  );
}
