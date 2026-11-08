import { useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  GitBranch,
  Layers,
  Repeat2,
} from "lucide-react";
import "./agent-workspace.css";

const modes = [
  {
    title: "Refine",
    icon: Repeat2,
    text: "Ask your agent to build, test, and improve an idea over several rounds.",
    task: "Make booking easier",
    lanes: [
      "Build the booking flow",
      "Test the experience",
      "Refine the result",
    ],
  },
  {
    title: "Compare",
    icon: GitBranch,
    text: "Try different approaches in separate previews, then compare how they work.",
    task: "Explore two approaches",
    lanes: [
      "Preview A · Calendar first",
      "Preview B · Service first",
      "Compare the results",
    ],
  },
  {
    title: "Work in parallel",
    icon: Layers,
    text: "Work on different apps in separate conversations in your remote workspace.",
    task: "Continue your projects",
    lanes: ["Booking app", "Team workspace", "Personal planner"],
  },
] as const;

export function AgentWorkspace() {
  const [active, setActive] = useState(0);
  const mode = modes[active] ?? modes[0];
  return (
    <section className="agent-workspace" aria-labelledby="agent-title">
      <div className="launch-container">
        <div className="agent-heading">
          <h2 id="agent-title">Agent Mode</h2>
          <div>
            <p>
              Give your agent a remote computer for longer tasks, while you get
              on with your day.
            </p>
            <a href="/build#agent-mode">
              Explore Agent Mode <ArrowUpRight size={19} />
            </a>
          </div>
        </div>
        <div className="agent-workspace-body">
          <div
            className="agent-mode-tabs"
            role="group"
            aria-label="Explore Agent Mode"
          >
            {modes.map((item, index) => (
              <button
                key={item.title}
                type="button"
                aria-pressed={active === index}
                onClick={() => setActive(index)}
              >
                <item.icon size={21} />
                {item.title}
              </button>
            ))}
            <p aria-live="polite">{mode.text}</p>
          </div>
          <div
            className="agent-window"
            aria-label="Illustrative remote workspace"
          >
            <div className="agent-window-top">
              <span className="agent-window-dot" />
              Remote workspace <span>Example</span>
            </div>
            <div className="agent-window-main">
              <div className="agent-session">
                <span>Your request</span>
                <strong>{mode.task}</strong>
              </div>
              <div className="agent-previews" aria-hidden="true">
                {active === 0 ? (
                  <>
                    <Preview title="Before" kind="before" />
                    <ArrowRight className="agent-refine-arrow" size={24} />
                    <Preview title="After" kind="after" />
                  </>
                ) : active === 1 ? (
                  <>
                    <Preview title="Calendar first" kind="calendar" />
                    <Preview title="Service first" kind="service" />
                  </>
                ) : (
                  <>
                    <Preview title="Booking app" kind="calendar" />
                    <Preview title="Team workspace" kind="team" />
                    <Preview title="Personal planner" kind="planner" />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Preview({ title, kind }: { title: string; kind: string }) {
  return (
    <div className="agent-preview">
      <div className="agent-preview-title">{title}</div>
      <div className="agent-preview-screen">
        {kind === "calendar" ? (
          <>
            <strong>Choose a day</strong>
            <div className="agent-calendar">
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <b>12</b>
              <b>13</b>
              <b>14</b>
            </div>
            <div className="agent-preview-button">Choose time</div>
          </>
        ) : kind === "service" ? (
          <>
            <strong>Choose a service</strong>
            <div className="agent-preview-row">
              Consultation <span>→</span>
            </div>
            <div className="agent-preview-row">
              Follow-up <span>→</span>
            </div>
          </>
        ) : kind === "team" ? (
          <>
            <strong>Team projects</strong>
            <div className="agent-preview-row">
              Launch plan <span>→</span>
            </div>
            <div className="agent-preview-row">
              Ideas <span>→</span>
            </div>
          </>
        ) : kind === "planner" ? (
          <>
            <strong>Today</strong>
            <div className="agent-preview-row">○ Review plans</div>
            <div className="agent-preview-row">○ Make time to focus</div>
          </>
        ) : (
          <>
            <strong>Book a consultation</strong>
            {kind === "before" ? (
              <>
                <div className="agent-preview-row">
                  Choose a day <span>→</span>
                </div>
                <div className="agent-preview-row">
                  Choose a time <span>→</span>
                </div>
                <div className="agent-preview-row">
                  Review booking <span>→</span>
                </div>
              </>
            ) : (
              <>
                <div className="agent-preview-row">Monday · 10:00</div>
                <div className="agent-preview-row">Monday · 14:00</div>
                <div className="agent-preview-button">Choose &amp; book</div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
