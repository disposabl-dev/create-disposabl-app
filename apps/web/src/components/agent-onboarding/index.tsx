import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { type Platform } from "@disposabl/disposabl-kit/platforms";
import { AgentLogos } from "./logos";
import "./style.css";

const prompt =
  "Build my app with create-disposabl-app@latest. Ask me what I want to make.";
const commands = {
  Bun: "bunx create-disposabl-app@latest",
  npm: "npx create-disposabl-app@latest",
  pnpm: "pnpm dlx create-disposabl-app@latest",
  Yarn: "yarn dlx create-disposabl-app@latest",
};

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

export function AgentOnboarding({
  idea = "",
  platforms,
}: {
  idea?: string;
  platforms?: Platform[];
}) {
  const platformNote = platforms?.length
    ? ` Use these platforms: ${platforms.join(", ")}.`
    : "";
  const appPrompt = idea
    ? `Build my app with create-disposabl-app@latest. ${idea}${platformNote} Ask me the questions you need before building.`
    : `${prompt}${platformNote}`;
  const [mode, setMode] = useState<"prompt" | "terminal">("prompt");
  const [manager, setManager] = useState<keyof typeof commands>("Bun");
  const command = `${commands[manager]}${platforms?.length ? ` --platforms ${platforms.join(",")}` : ""}`;
  const text = mode === "prompt" ? appPrompt : command;
  return (
    <div className="landing-start" data-testid="agent-onboarding">
      <AgentLogos />
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
          <p className="landing-prompt">{appPrompt}</p>
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
            <code>{command}</code>
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
  );
}
