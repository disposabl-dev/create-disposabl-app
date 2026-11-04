import codex from "./assets/codex.png";
import claude from "./assets/claude.svg";
import cursor from "./assets/cursor.svg";
import antigravity from "./assets/antigravity.svg";
import muse from "./assets/muse.svg";
import grok from "./assets/grok.ico";
import dots from "./assets/dots.png";
import instinct from "./assets/instinct.ico";

const agents = [
  { name: "Codex", icon: codex, url: "https://openai.com/codex/" },
  {
    name: "Claude Code",
    icon: claude,
    url: "https://claude.com/product/claude-code",
  },
  { name: "Cursor", icon: cursor, url: "https://cursor.com" },
  { name: "Antigravity", icon: antigravity, url: "https://antigravity.google" },
  { name: "Muse", icon: muse, url: "https://muse.ai" },
  { name: "Grok Bot", icon: grok, url: "https://x.ai/bot" },
  { name: "Dots", icon: dots, url: "https://chatgpt.com/features/dots/" },
  { name: "Instinct", icon: instinct, url: "https://www.humaninstinct.com" },
];

export function AgentLogos() {
  return (
    <div className="agent-logos">
      <div
        className="agent-logo-stack"
        role="group"
        aria-label="Coding agents and assistants"
      >
        {agents.map(({ name, icon, url }) => (
          <a
            key={name}
            className="agent-logo"
            href={url}
            title={name}
            aria-label={name}
            target="_blank"
            rel="noreferrer"
          >
            <img src={icon} alt="" width={20} height={20} />
          </a>
        ))}
      </div>
      <span>
        Open your coding agent.
        <br />
        Paste the prompt below.
      </span>
    </div>
  );
}
