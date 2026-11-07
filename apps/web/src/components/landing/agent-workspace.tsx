import { useState } from "react";
import {
  ArrowUpRight,
  Check,
  GitBranch,
  Layers,
  Repeat2,
  ArrowRight,
  Circle,
  Folder,
  Terminal,
  Play,
} from "lucide-react";

const modes = [
  {
    title: "Keep improving",
    icon: Repeat2,
    text: "Build a version, test it, then refine it. Ask your agent to keep working toward a clearer result.",
    task: "Make booking easier",
    items: [
      "Build the booking flow",
      "Check it on a phone",
      "Simplify the confirmation",
    ],
  },
  {
    title: "Compare approaches",
    icon: GitBranch,
    text: "Try different approaches in separate previews. Compare what works and choose what to keep.",
    task: "Two ways to book",
    items: ["Calendar first", "Services first", "Compare both previews"],
  },
  {
    title: "Work in parallel",
    icon: Layers,
    text: "Work on different apps in separate conversations. Project files and dependencies stay in the remote workspace.",
    task: "Room for another idea",
    items: ["A booking app", "A weekend game", "Your community app"],
  },
] as const;

export function AgentWorkspace() {
  const [active, setActive] = useState(0);
  const mode = modes[active] ?? modes[0];
  return (
    <section
      className="agent-workspace launch-container"
      aria-labelledby="agent-title"
    >
      <div className="agent-section-heading">
        <h2 id="agent-title">
          Big jobs.
          <br />
          Quiet laptop.
        </h2>
        <div>
          <h3>Meet Agent Mode.</h3>
          <p>
            Your agent works on a remote computer. Let longer tasks run there
            while you get on with your day.
          </p>
          <a className="text-link" href="/build#agent-mode">
            How Agent Mode works <ArrowUpRight size={19} />
          </a>
        </div>
      </div>
      <div className="agent-workspace-body">
        <div
          className="agent-mode-controls"
          role="group"
          aria-label="Explore Agent Mode"
        >
          {modes.map((item, index) => (
            <button
              key={item.title}
              aria-pressed={active === index}
              onClick={() => setActive(index)}
            >
              <item.icon size={22} />
              <span>{item.title}</span>
              <ArrowRight size={20} />
            </button>
          ))}
          <p aria-live="polite">{mode.text}</p>
        </div>
        <div
          className="remote-example"
          key={active}
          aria-label="Illustrative remote workflow"
        >
          <div className="remote-top">
            <span className="remote-dot" /> Remote workspace<span>Example</span>
          </div>
          <div className="remote-task">
            <Folder size={22} />
            <h3>{mode.task}</h3>
          </div>
          <div className="remote-work-list">
            {mode.items.map((item, index) => (
              <div key={item} style={{ animationDelay: `${index * 80}ms` }}>
                <span className={index === 2 ? "task-current" : "task-done"}>
                  {active === 2 ? (
                    <Layers size={18} />
                  ) : index === 2 ? (
                    <Circle size={18} />
                  ) : (
                    <Check size={18} />
                  )}
                </span>
                <span>{item}</span>
                {active === 1 ? (
                  <span className="preview-symbol">
                    <ArrowUpRight size={18} />
                  </span>
                ) : active === 2 ? (
                  <span className="task-line" />
                ) : null}
              </div>
            ))}
          </div>
          <div className="remote-preview" aria-hidden="true">
            <div className="remote-preview-nav">
              <span />
              <span />
              <span />
            </div>
            <div className="remote-preview-content">
              <div>
                <span className="preview-date">
                  SUN
                  <br />
                  <strong>24</strong>
                </span>
                <div>
                  <strong>Your next booking</strong>
                  <span>Choose a time that works.</span>
                </div>
              </div>
              <div className="preview-time-row">
                <span>9:00</span>
                <span>10:30</span>
                <span>12:00</span>
              </div>
            </div>
          </div>
          <div className="remote-bottom">
            <span>
              <Terminal size={17} /> Files stay here
            </span>
            <span>
              <Play size={16} /> Preview &amp; refine
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
