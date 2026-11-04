import { AgentOnboarding } from "../agent-onboarding";
import { ArrowUpRight, CodeXml, Terminal } from "lucide-react";
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

export function Home() {
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

        <AgentOnboarding />

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
