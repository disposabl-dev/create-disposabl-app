import { useState } from "react";
import { Check, Copy, ArrowUpRight, Terminal } from "lucide-react";
import { useHydrated } from "@tanstack/react-router";
import { BrandIcon } from "./brand-icon";
import { setupPrompt } from "../agent-onboarding";
import codex from "../agent-onboarding/assets/codex.png";
import claude from "../agent-onboarding/assets/claude.svg";
import cursor from "../agent-onboarding/assets/cursor.svg";

export const setupCommand = "npx create-disposabl-app@latest";

export function StartActions({
  onDetails,
  closing = false,
}: {
  onDetails: () => void;
  closing?: boolean;
}) {
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
    <div className={`start-actions${closing ? " closing-actions" : ""}`}>
      <div className="visible-prompt">
        <p className="setup-prompt-text">{setupPrompt}</p>
        <div className="agent-start-row">
          <button
            id={closing ? undefined : "start"}
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
      <div className="store-group">
        <div className="store-buttons">
          {["App Store", "Google Play"].map((name, index) => (
            <div className="store-control" key={name}>
              <button
                type="button"
                aria-disabled="true"
                aria-describedby={`store-tip-${closing ? "end-" : ""}${index}`}
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
                id={`store-tip-${closing ? "end-" : ""}${index}`}
                role="tooltip"
                className="store-tooltip"
              >
                Coming soon.
              </span>
            </div>
          ))}
        </div>
      </div>
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
