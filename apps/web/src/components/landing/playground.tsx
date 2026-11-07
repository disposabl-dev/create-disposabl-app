import { useHydrated } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Copy,
  Info,
  Star,
  Heart,
  Moon,
  Sun,
  Zap,
  Flower2,
} from "lucide-react";
import { BookingDemo, PlannerDemo, CommunityDemo } from "./app-examples";
import { GameDemo } from "./game-example";
import { OperationsDemo } from "./operations-example";

export const appIdeas = [
  {
    id: "planner",
    label: "Daily planner",
    title: "Your day. Your way.",
    prompt:
      "A personal planner for my tasks, routines, and weekly goals. I want to see what matters today and keep track of my progress.",
  },
  {
    id: "game",
    label: "Games",
    title: "Games for web and mobile.",
    prompt:
      "A casual memory matching game for web, iOS, and Android, with touch controls, score tracking, a restart button, and accessible controls. Start with a small playable version and test it on each platform.",
  },
  {
    id: "community",
    label: "Community app",
    title: "Your people. In one place.",
    prompt:
      "An app for my community to organize events, let members RSVP, and share updates. Each member should have their own account.",
  },
  {
    id: "booking",
    label: "Booking app",
    title: "Open for business.",
    prompt:
      "An app for my business where customers can choose a service, pick a time, and book an appointment.",
  },
  {
    id: "operations",
    label: "Team operations",
    title: "A workspace for your whole team.",
    prompt:
      "A team operations app with individual sign-in, role-based access, request approvals, an activity history, and an optional analytics dashboard. Help me design and test the access rules before publishing.",
  },
] as const;

export function AppPlayground({
  onUseIdea,
}: {
  onUseIdea: (idea: string) => void;
}) {
  const hydrated = useHydrated();
  const [active, setActive] = useState(0);
  const [shared, setShared] = useState("");
  const idea = appIdeas[active] ?? appIdeas[0];
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("idea");
    const index = appIdeas.findIndex((item) => item.id === id);
    if (index >= 0) setActive(index);
  }, []);
  async function share() {
    const url = new URL("/", window.location.origin);
    url.searchParams.set("idea", idea.id);
    url.hash = "examples";
    try {
      await navigator.clipboard.writeText(url.href);
      setShared("Link copied. Send it to someone you’d build with.");
    } catch {
      setShared(url.href);
    }
  }
  return (
    <section
      id="examples"
      className="playground-section launch-container"
      aria-labelledby="playground-title"
    >
      <div className="playground-heading">
        <h2 id="playground-title">See what you can make.</h2>
      </div>
      <div
        className="playground-tabs"
        role="group"
        aria-label="Choose an app example"
      >
        {appIdeas.map((item, i) => (
          <button
            disabled={!hydrated}
            aria-pressed={i === active}
            key={item.id}
            onClick={() => {
              setActive(i);
              setShared("");
            }}
          >
            {item.label}
            <ArrowUpRight size={22} />
          </button>
        ))}
      </div>
      <div className={`playground-panel example-${idea.id}`}>
        <div className="playground-story">
          <h3>{idea.title}</h3>
          <button
            className="primary-link"
            disabled={!hydrated}
            onClick={() => onUseIdea(idea.prompt)}
          >
            Build this app <ArrowUpRight size={20} />
          </button>
          <button className="share-idea" disabled={!hydrated} onClick={share}>
            <Copy size={18} />
            Share this idea
          </button>
          <div className="share-feedback" aria-live="polite">
            {shared}
          </div>
        </div>
        <div className="playground-demo">
          <div className="phone-companion" aria-hidden="true">
            <div className="phone-island" />
            <span>
              {idea.id === "planner"
                ? "Your week"
                : idea.id === "game"
                  ? "All matched."
                  : idea.id === "community"
                    ? "Together"
                    : idea.id === "booking"
                      ? "Your calendar"
                      : "Your team"}
            </span>
            {idea.id === "game" ? (
              <>
                <p className="companion-score">6 / 6 pairs</p>
                <div className="companion-game">
                  {[
                    Star,
                    Heart,
                    Moon,
                    Sun,
                    Zap,
                    Star,
                    Flower2,
                    Moon,
                    Heart,
                    Flower2,
                    Sun,
                    Zap,
                  ].map((Icon, i) => (
                    <span key={i}>
                      <Icon size={22} />
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <div className="companion-art">
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
            )}
          </div>
          <div className="demo-phone">
            <div className="phone-hardware" aria-hidden="true">
              <span>9:41</span>
              <div className="phone-island" />
              <span>▮▮▮</span>
            </div>
            <div className="phone-screen">
              <div className="demo-disclosure">
                <button
                  aria-label="About this interactive example"
                  aria-describedby={`demo-info-${idea.id}`}
                >
                  <Info size={16} />
                  Demo
                </button>
                <span id={`demo-info-${idea.id}`} role="tooltip">
                  Interactive example. Nothing is booked, saved, or sent.
                </span>
              </div>
              {idea.id === "booking" ? (
                <BookingDemo disabled={!hydrated} />
              ) : idea.id === "planner" ? (
                <PlannerDemo disabled={!hydrated} />
              ) : idea.id === "game" ? (
                <GameDemo disabled={!hydrated} />
              ) : idea.id === "community" ? (
                <CommunityDemo disabled={!hydrated} />
              ) : (
                <OperationsDemo disabled={!hydrated} />
              )}
            </div>
            <div className="phone-home" aria-hidden="true" />
          </div>
        </div>
      </div>
    </section>
  );
}
