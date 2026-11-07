import { useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  GitBranch,
  Globe2,
  Monitor,
  Smartphone,
} from "lucide-react";
import { type Platform } from "@disposabl/disposabl-kit/platforms";
import { AgentOnboarding } from "../agent-onboarding";
import { MarketingShell, TextLink } from "./shell";
import { PlatformExplorer } from "./platform-explorer";
import { Pricing, Questions, BuildJourney } from "./sections";
import apple from "./assets/apple.svg";
import "./home.css";

export function Home() {
  const [selected, setSelected] = useState<Platform[]>([
    "web",
    "android",
    "ios",
  ]);
  return (
    <MarketingShell>
      <main id="main" className="launch-home">
        <section
          className="launch-hero launch-container"
          aria-labelledby="hero-title"
        >
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="live-dot" /> THE OPEN-SOURCE APP BUILDER
            </p>
            <h1 id="hero-title">
              Your app.
              <br />
              <span>Everywhere.</span>
            </h1>
            <p className="hero-description">
              Your AI. Your computer. Your code.
            </p>
            <p className="hero-detail">
              A connected foundation for web, mobile, and desktop. Build with
              your coding agent, free on your own computer.
            </p>
            <div id="start" className="hero-start">
              <AgentOnboarding guided />
              <p className="start-note">
                No Disposabl subscription. Your AI provider's costs still apply.
              </p>
            </div>
            <StoreButtons />
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="art-caption">
              <span>ONE IDEA. ALL YOUR SCREENS.</span>
              <span>01 / ∞</span>
            </div>
            <div className="blueprint-lines" aria-hidden="true" />
            <div className="art-window art-web">
              <div className="window-bar">
                <span className="window-dots">● ● ●</span>
                <span>your-next-idea.app</span>
                <ArrowUpRight size={14} />
              </div>
              <div className="app-illustration">
                <div className="illustration-top">
                  <span>
                    little things<span className="tiny-star">✳</span>
                  </span>
                  <span>YOUR SPACE TO MAKE</span>
                </div>
                <div className="illustration-title">
                  Good ideas
                  <br />
                  deserve to exist.
                </div>
                <div className="illustration-bottom">
                  <span className="illustration-pill">
                    Make something yours ↗
                  </span>
                  <span>01—03</span>
                </div>
              </div>
              <div className="window-label">
                <Monitor size={15} /> WEB + DESKTOP{" "}
                <span>React · Electron</span>
              </div>
            </div>
            <div className="art-phone">
              <div className="phone-top">
                <span>9:41</span>
                <span className="phone-island" />
                <span>•••</span>
              </div>
              <span className="phone-star" aria-hidden="true">
                ✳
              </span>
              <p>
                Big ideas.
                <br />
                <em>Pocket size.</em>
              </p>
              <div className="phone-items">
                <span>
                  <Check size={12} /> Make a start
                </span>
                <span>
                  <Check size={12} /> Make it yours
                </span>
                <span>
                  <span className="empty-check" /> Take it anywhere
                </span>
              </div>
              <div className="phone-bottom">
                iOS + Android <Smartphone size={14} />
              </div>
            </div>
            <div className="ownership-stamp">
              <GitBranch size={17} />
              <span>
                100%
                <br />
                <strong>YOUR CODE</strong>
              </span>
            </div>
            <div className="art-code">
              <span>+</span> API <span>+</span> CLI <span>+</span> SDK{" "}
              <span>+</span> MCP
            </div>
            <p className="art-footnote">
              One shared backend. Your choice of platforms.
              <br />
              <span>
                Illustrative app design, built to show the possibilities.
              </span>
            </p>
          </div>
        </section>
        <section className="ownership-band" aria-label="Built on your terms">
          <div className="launch-container ownership-grid">
            <div>
              <span>01</span>
              <h2>Your AI.</h2>
              <p>
                Claude Code, Codex, Cursor.
                <br />
                Bring your favorite coding agent.
              </p>
            </div>
            <div>
              <span>02</span>
              <h2>Your computer.</h2>
              <p>
                Develop and test locally.
                <br />
                No Disposabl credits ticking away.
              </p>
            </div>
            <div>
              <span>03</span>
              <h2>Your code.</h2>
              <p>
                A real repository. MIT licensed.
                <br />
                Read it, change it, keep it.
              </p>
            </div>
            <a
              className="band-scroll"
              href="#platforms"
              aria-label="Explore the platforms"
            >
              <ArrowDown size={22} />
            </a>
          </div>
        </section>
        <PlatformExplorer selected={selected} onChange={setSelected} />
        <section
          className="foundation-section launch-container"
          aria-labelledby="foundation-title"
        >
          <div className="section-heading">
            <p className="eyebrow">LESS SETUP. MORE OF YOUR IDEA.</p>
            <h2 id="foundation-title">
              The boring parts?
              <br />
              <span>Already thought through.</span>
            </h2>
            <p>
              A personal tool today. A business tomorrow. Start with the same
              foundations.
            </p>
          </div>
          <div className="foundation-grid">
            <article>
              <span className="feature-symbol" aria-hidden="true">
                ↔
              </span>
              <h3>One backend, in sync.</h3>
              <p>
                Convex gives your platforms a shared database and server
                functions, with live updates built in.
              </p>
              <TextLink href="/stack">Explore the stack</TextLink>
            </article>
            <article>
              <span className="feature-symbol" aria-hidden="true">
                ✓
              </span>
              <h3>Test the thing you built.</h3>
              <p>
                Starter checks for web, mobile, backend, and API. Your agent can
                extend them as your app grows.
              </p>
              <TextLink href="/build">See the build journey</TextLink>
            </article>
            <article>
              <span className="feature-symbol" aria-hidden="true">
                Soon
              </span>
              <h3>A path past localhost.</h3>
              <p>
                GitHub workflows for previews and releases. Add your provider
                accounts and signing credentials when you're ready.
              </p>
              <TextLink href="/build#publishing">
                From preview to publishing
              </TextLink>
            </article>
          </div>
        </section>
        <section className="agent-story" aria-labelledby="agent-story-title">
          <div className="launch-container agent-story-grid">
            <div>
              <p className="eyebrow">THE QUESTION YOU'RE PROBABLY ASKING</p>
              <h2 id="agent-story-title">
                “Why not just
                <br />
                use Claude Code?”
              </h2>
              <p className="story-answer">You should. Bring it with you.</p>
              <p>
                Your agent writes the code. Disposabl gives it a connected
                project, platform setup, tests, and release workflows to build
                on. Spend your prompts on what makes your app yours.
              </p>
              <TextLink href="/why-disposabl">
                See how they work together
              </TextLink>
            </div>
            <div className="agent-recipe">
              <div>
                <span className="recipe-number">01</span>
                <span>
                  Your idea<small>The thing only you would make.</small>
                </span>
              </div>
              <div>
                <span className="recipe-number">02</span>
                <span>
                  Your coding agent<small>The AI you already know.</small>
                </span>
              </div>
              <div>
                <span className="recipe-number">03</span>
                <span>
                  Disposabl<small>The connected app foundation.</small>
                </span>
              </div>
              <div className="recipe-result">
                <span>→</span>
                <strong>Your app. Your rules.</strong>
              </div>
            </div>
          </div>
        </section>
        <BuildJourney />
        <section
          className="language-section launch-container"
          aria-labelledby="language-title"
        >
          <div className="language-art" aria-hidden="true">
            <span>Hello.</span>
            <span>नमस्ते.</span>
            <span>こんにちは.</span>
            <span>Hola.</span>
            <span>สวัสดี.</span>
            <Globe2 className="language-globe" size={96} strokeWidth={0.8} />
          </div>
          <div>
            <span className="soon-label">COMING SOON</span>
            <h2 id="language-title">
              A world of people.
              <br />
              <span>85+ languages.</span>
            </h2>
            <p>
              Your app shouldn't stop where your first language does. We're
              planning localization with{" "}
              <a className="inline-link" href="https://generaltranslation.com/">
                General Translation
              </a>
              , so more people can feel at home in what you make.
            </p>
            <p className="fine-print">
              Planned integration. Localization is not available in the starter
              yet.
            </p>
          </div>
        </section>
        <Pricing />
        <Questions />
        <section
          className="final-section launch-container"
          aria-labelledby="final-title"
        >
          <p className="eyebrow">
            PERSONAL PROJECT. NEXT BIG THING. WHY NOT BOTH?
          </p>
          <h2 id="final-title">
            It starts with
            <br />
            <span>your little idea.</span>
          </h2>
          <a className="primary-link" href="#start">
            Let's build it <ArrowUpRight size={20} />
          </a>
          <p>Free to build locally. Yours to take anywhere.</p>
        </section>
      </main>
    </MarketingShell>
  );
}

function StoreButtons() {
  return (
    <div className="store-group">
      <div className="store-caption">
        <Smartphone size={14} />
        <span>
          Build from your phone <span className="soon-inline">Coming soon</span>
        </span>
      </div>
      <div className="store-buttons">
        {["App Store", "Google Play"].map((name, index) => (
          <div className="store-control" key={name}>
            <button
              type="button"
              aria-disabled="true"
              aria-describedby={`store-tip-${index}`}
              className="store-button"
            >
              <span aria-hidden="true">
                {index === 0 ? (
                  <img src={apple} alt="" width={22} height={22} />
                ) : (
                  "▷"
                )}
              </span>
              <span>
                <small>{index === 0 ? "Download on the" : "Get it on"}</small>
                {name}
              </span>
              <span className="store-lock" aria-hidden="true">
                ↗
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
    </div>
  );
}
