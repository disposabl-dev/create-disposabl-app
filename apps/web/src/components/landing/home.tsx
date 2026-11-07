import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Laptop, X } from "lucide-react";
import { type Platform } from "@disposabl/disposabl-kit/platforms";
import { AgentOnboarding } from "../agent-onboarding";
import { MarketingShell, TextLink } from "./shell";
import { PlatformExplorer } from "./platform-explorer";
import { Pricing, Questions } from "./sections";
import { BrandIcon } from "./brand-icon";
import { PlatformArt } from "./platform-art";
import { OutcomePicker } from "./outcome-picker";
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
  const [idea, setIdea] = useState("");
  useEffect(() => {
    const openFromLink = () => {
      if (window.location.hash === "#start") dialog.current?.showModal();
    };
    openFromLink();
    window.addEventListener("hashchange", openFromLink);
    return () => window.removeEventListener("hashchange", openFromLink);
  }, []);
  const start = () => {
    setIdea("");
    dialog.current?.showModal();
  };
  const startIdea = (value: string) => {
    setIdea(value);
    dialog.current?.showModal();
  };
  return (
    <MarketingShell onStart={start}>
      <main id="main" className="launch-home">
        <section
          className="launch-hero launch-container"
          aria-labelledby="hero-title"
        >
          <div className="hero-copy">
            <h1 id="hero-title">
              Your idea.
              <br />
              <span>Your next app.</span>
            </h1>
            <p className="hero-description">
              Your AI. Your computer. Your code.
            </p>
            <div className="hero-actions">
              <button id="start" className="primary-link" onClick={start}>
                <Laptop size={23} />
                Start building free
                <ArrowUpRight size={22} />
              </button>
              <StoreButtons />
            </div>
          </div>
          <PlatformArt />
        </section>
        <OutcomePicker onSelect={startIdea} />
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
              Your whole ecosystem.
              <br />
              Already connected.
            </h2>
            <p>
              Apps, backend, sign-in, tests, and publishing. Give your AI the
              full picture from the first prompt.
            </p>
            <TextLink href="/why-disposabl">Why Disposabl?</TextLink>
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
          </div>
        </section>
        <Questions />
        <section className="final-section launch-container">
          <h2>
            Make your
            <br />
            next big thing.
          </h2>
          <button className="primary-link" onClick={start}>
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
        <AgentOnboarding idea={idea} platforms={selected} />
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
              Coming soon. The Disposabl mobile app is on its way.
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
