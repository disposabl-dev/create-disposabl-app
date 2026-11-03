import { useState } from "react";
import { ArrowUpRight, Check, CodeXml, Copy, Terminal } from "lucide-react";
import { platforms, type Platform } from "@disposabl/disposabl-kit/platforms";
import apple from "./assets/apple.svg";
import android from "./assets/android.svg";
import chrome from "./assets/chrome.svg";
import linux from "./assets/linux.svg";
import windows from "./assets/windows.svg";
import mcp from "./assets/mcp.svg";
import typescript from "./assets/typescript.svg";
import github from "./assets/github.svg";
import "./home.css";

const repository = "https://github.com/disposabl-dev/create-disposabl-app";
const prompt =
  "Build my app with create-disposabl-app@latest. Ask me what I want to make.";
const commands = {
  Bun: "bunx create-disposabl-app@latest",
  npm: "npx create-disposabl-app@latest",
  pnpm: "pnpm dlx create-disposabl-app@latest",
  Yarn: "yarn dlx create-disposabl-app@latest",
};
const logos: Partial<Record<Platform, string>> = {
  web: chrome,
  ios: apple,
  android,
  macos: apple,
  windows,
  linux,
  mcp,
  "typescript-sdk": typescript,
};
const platformOrder: Platform[] = [
  "web",
  "ios",
  "android",
  "macos",
  "windows",
  "linux",
  "mcp",
  "api",
  "cli",
  "typescript-sdk",
];

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }

  return (
    <div className="landing-copy-control">
      <button type="button" className="landing-copy-button" onClick={copy}>
        {copied ? (
          <Check size={17} aria-hidden="true" />
        ) : (
          <Copy size={17} aria-hidden="true" />
        )}
        {copied ? "Copied" : label}
      </button>
      <span className={failed ? "landing-copy-error" : "sr-only"} role="status">
        {failed
          ? "Select the text to copy it manually."
          : copied
            ? "Copied to clipboard."
            : ""}
      </span>
    </div>
  );
}

export function Home() {
  const [mode, setMode] = useState<"prompt" | "terminal">("prompt");
  const [manager, setManager] = useState<keyof typeof commands>("Bun");
  const text = mode === "prompt" ? prompt : commands[manager];

  return (
    <main className="disposabl-home" aria-labelledby="hero-title">
      <section className="landing-intro">
        <h1 id="hero-title">
          Your app,
          <br />
          everywhere<span>.</span>
        </h1>
        <p className="landing-description">
          Build with your favorite coding agent.
        </p>

        <div className="landing-start">
          <div className="landing-modes" role="group" aria-label="How to start">
            <button
              type="button"
              aria-pressed={mode === "prompt"}
              onClick={() => setMode("prompt")}
            >
              Copy a prompt
            </button>
            <button
              type="button"
              aria-pressed={mode === "terminal"}
              onClick={() => setMode("terminal")}
            >
              Run a command
            </button>
          </div>
          <div className="landing-composer">
            {mode === "prompt" ? (
              <p className="landing-prompt">{prompt}</p>
            ) : (
              <div className="landing-terminal">
                <div
                  className="landing-managers"
                  role="group"
                  aria-label="Package manager"
                >
                  {(Object.keys(commands) as (keyof typeof commands)[]).map(
                    (name) => (
                      <button
                        key={name}
                        type="button"
                        aria-pressed={manager === name}
                        onClick={() => setManager(name)}
                      >
                        {name}
                      </button>
                    ),
                  )}
                </div>
                <code>{commands[manager]}</code>
              </div>
            )}
            <div className="landing-composer-footer">
              <p>
                {mode === "prompt"
                  ? "Paste into your coding agent."
                  : "Run in your terminal. Requires Bun."}
              </p>
              <CopyButton
                key={text}
                text={text}
                label={mode === "prompt" ? "Copy prompt" : "Copy command"}
              />
            </div>
          </div>
        </div>

        <a
          className="landing-source"
          href={repository}
          target="_blank"
          rel="noreferrer"
        >
          <img src={github} alt="" width={20} height={20} /> Open source{" "}
          <ArrowUpRight size={17} aria-hidden="true" />
        </a>
      </section>

      <aside className="landing-platforms" aria-label="Supported platforms">
        <ul>
          {platformOrder.map((id) => (
            <li key={id}>
              <span className="landing-platform-icon">
                {logos[id] ? (
                  <img src={logos[id]} alt="" width={30} height={30} />
                ) : id === "cli" ? (
                  <Terminal size={30} strokeWidth={1.6} aria-hidden="true" />
                ) : (
                  <CodeXml size={30} strokeWidth={1.6} aria-hidden="true" />
                )}
              </span>
              <span>
                {platforms.find((platform) => platform.id === id)!.label}
              </span>
            </li>
          ))}
        </ul>
      </aside>
    </main>
  );
}
