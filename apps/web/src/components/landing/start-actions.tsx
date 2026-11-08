import { useState } from "react";
import { Check, Copy, ArrowUpRight, Terminal } from "lucide-react";
import { useHydrated } from "@tanstack/react-router";
import { StoreDownloads } from "./store-downloads";
import { setupPrompt } from "../agent-onboarding";
import codex from "../agent-onboarding/assets/codex.png";
import claude from "../agent-onboarding/assets/claude.svg";
import cursor from "../agent-onboarding/assets/cursor.svg";

export const setupCommand = "npx create-disposabl-app@latest";

export function StartActions({ onDetails }: { onDetails: () => void }) {
  const hydrated = useHydrated();
  const [failed, setFailed] = useState<string | null>(null);
  const [copied, setCopied] = useState<"prompt" | "command" | null>(null);
  async function copy(kind: "prompt" | "command") {
    try {
      await navigator.clipboard.writeText(
        kind === "prompt" ? setupPrompt : setupCommand,
      );
      setCopied(kind);
      setFailed(null);
    } catch {
      setFailed(kind === "prompt" ? setupPrompt : setupCommand);
    }
  }
  return (
    <div className="start-actions">
      <div className="visible-prompt">
        <p className="setup-prompt-text">{setupPrompt}</p>
        <div className="agent-start-row">
          <button
            id="start"
            disabled={!hydrated}
            className="copy-start"
            onClick={() => void copy("prompt")}
          >
            {copied === "prompt" ? <Check size={21} /> : <Copy size={21} />}
            {copied === "prompt" ? "Copied" : "Copy prompt"}
          </button>
          <div
            className="start-agent-logos"
            role="group"
            aria-label="Use with your coding agent"
          >
            {[
              ["Claude Code", claude],
              ["Codex", codex],
              ["Cursor", cursor],
            ].map(([name, icon]) => (
              <span key={name} title={name}>
                <img src={icon} alt={name} width={28} height={28} />
              </span>
            ))}
          </div>
          <button
            className="setup-help"
            disabled={!hydrated}
            aria-label="View setup instructions"
            onClick={onDetails}
          >
            <ArrowUpRight size={20} />
          </button>
        </div>
      </div>
      <StoreDownloads />
      <button
        className="command-start"
        disabled={!hydrated}
        onClick={() => void copy("command")}
        aria-label="Copy npx command"
      >
        <Terminal size={17} />
        <code>{setupCommand}</code>
        {copied === "command" ? <Check size={17} /> : <Copy size={17} />}
      </button>
      {failed && (
        <div className="copy-fallback" role="status">
          <p>Copy this text:</p>
          <p>{failed}</p>
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {copied
          ? `${copied === "prompt" ? "Prompt" : "Command"} copied to clipboard.`
          : ""}
      </span>
    </div>
  );
}
