import { ArrowUpRight } from "lucide-react";
import { BrandIcon } from "./brand-icon";
import codex from "../agent-onboarding/assets/codex.png";
import claude from "../agent-onboarding/assets/claude.svg";

const interfaces = [
  { name: "MCP", icon: "MCP", text: "Let AI assistants work with your app." },
  { name: "API", icon: "OpenAPI", text: "Connect your app to other software." },
  {
    name: "CLI",
    icon: "CLI",
    text: "Run it from a terminal. Automate repeat work.",
  },
  {
    name: "SDK",
    icon: "TypeScript SDK",
    text: "Give developers a way to build on your app.",
  },
];
export function Ecosystem() {
  return (
    <section
      className="ecosystem launch-container"
      aria-labelledby="ecosystem-title"
    >
      <div>
        <h2 id="ecosystem-title">
          For people.
          <br />
          And their tools.
        </h2>
        <p>
          Add only the interfaces you need. Your CLI and SDK use your API. MCP
          lets assistants work with your app's tools.
        </p>
      </div>
      <div className="interface-directory">
        {interfaces.map((item) => (
          <a key={item.name} href="/docs/">
            <BrandIcon name={item.icon} />
            <span>
              <strong>{item.name}</strong>
              <span>{item.text}</span>
            </span>
            <ArrowUpRight size={22} />
          </a>
        ))}
      </div>
      <details className="plugin-details" id="agent-plugins">
        <summary>
          <span className="plugin-logos">
            <img src={codex} alt="" width={28} height={28} />
            <img src={claude} alt="" width={28} height={28} />
          </span>{" "}
          Codex &amp; Claude Code plugins <span aria-hidden="true" />
        </summary>
        <div>
          <article>
            <h3>Use Disposabl in your agent.</h3>
            <p>
              Disposabl plugins bring app setup and operations into Codex and
              Claude Code. Start with the prompt and ask your agent to help you
              connect Disposabl.
            </p>
            <a className="text-link" href="/#start">
              Start with your agent <ArrowUpRight size={18} />
            </a>
          </article>
          <article>
            <h3>Build a plugin for your app.</h3>
            <p>
              Give users a way to work with your app from Codex or Claude Code.
              Ask your agent to connect the plugin to your app's MCP tools or
              API, then test its operations before sharing it.
            </p>
            <a className="text-link" href="/build">
              See the building workflow <ArrowUpRight size={18} />
            </a>
          </article>
        </div>
      </details>
    </section>
  );
}
