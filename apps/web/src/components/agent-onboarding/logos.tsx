import codex from "./assets/codex.png";
import claude from "./assets/claude.svg";
import cursor from "./assets/cursor.svg";
import antigravity from "./assets/antigravity.svg";
import muse from "./assets/muse.svg";
import grok from "./assets/grok.ico";
import dots from "./assets/dots.png";
import instinct from "./assets/instinct.ico";

const agents = [
  { name: "Codex", icon: codex },
  { name: "Claude Code", icon: claude },
  { name: "Cursor", icon: cursor },
  { name: "Antigravity", icon: antigravity },
  { name: "Muse", icon: muse },
  { name: "Grok Bot", icon: grok },
  { name: "Dots", icon: dots },
  { name: "Instinct", icon: instinct },
];

export function AgentLogos() {
  return (
    <div className="agent-logos">
      <div
        className="agent-logo-stack"
        role="group"
        aria-label="Coding agents and assistants"
      >
        {agents.map(({ name, icon }) => (
          <span key={name} className="agent-logo" title={name}>
            <img src={icon} alt={name} width={20} height={20} />
          </span>
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
