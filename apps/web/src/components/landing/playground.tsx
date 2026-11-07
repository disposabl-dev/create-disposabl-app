import { useHydrated } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Copy,
  Info,
  ArrowLeft,
  ArrowRight,
  Play,
  Pause,
  Check,
  CalendarDays,
  LayoutGrid,
  Search,
} from "lucide-react";
import { BookingDemo, PlannerDemo, CommunityDemo } from "./app-examples";
import { GameDemo } from "./game-example";
import { OperationsDemo } from "./operations-example";
import { BrandIcon } from "./brand-icon";

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

const details = [
  {
    title: "A planner that fits your day.",
    features: ["Tasks and routines", "Weekly goals", "Saved progress"],
    platforms: ["Web", "Apple", "Android", "Windows", "Linux"],
  },
  {
    title: "A game you want to play.",
    features: [
      "Touch and keyboard controls",
      "Scores and progress",
      "Your rules and artwork",
    ],
    platforms: ["Web", "Apple", "Android"],
  },
  {
    title: "An app for your people.",
    features: ["Events and RSVPs", "Member accounts", "Community updates"],
    platforms: ["Web", "Apple", "Android"],
  },
  {
    title: "Bookings on your terms.",
    features: [
      "Services and availability",
      "Customer accounts",
      "Appointment management",
    ],
    platforms: ["Web", "Apple", "Android"],
  },
  {
    title: "Software for how you work.",
    features: ["Team access", "Approvals and activity", "Connected workspaces"],
    platforms: ["Web", "Windows", "Apple", "Linux"],
  },
];
export function AppPlayground({
  onUseIdea,
}: {
  onUseIdea: (idea: string) => void;
}) {
  const hydrated = useHydrated();
  const [active, setActive] = useState(0);
  const [shared, setShared] = useState("");
  const [playing, setPlaying] = useState(false);
  const idea = appIdeas[active];
  const detail = details[active];
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("idea");
    const i = appIdeas.findIndex((x) => x.id === id);
    if (i >= 0) setActive(i);
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        setActive((v) => (v + 1) % appIdeas.length);
        setShared("");
      }
    }, 7000);
    return () => clearInterval(timer);
  }, [playing]);
  function choose(i: number) {
    setActive((i + appIdeas.length) % appIdeas.length);
    setShared("");
    setPlaying(false);
  }
  async function share() {
    const url = new URL("/", location.origin);
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
        <div className="showcase-controls">
          <button
            aria-label="Previous app example"
            onClick={() => choose(active - 1)}
          >
            <ArrowLeft size={20} />
          </button>
          <button
            aria-label={playing ? "Pause app examples" : "Play app examples"}
            aria-pressed={playing}
            onClick={() => setPlaying(!playing)}
          >
            {playing ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <button
            aria-label="Next app example"
            onClick={() => choose(active + 1)}
          >
            <ArrowRight size={20} />
          </button>
        </div>
      </div>
      <div
        className="playground-tabs"
        role="group"
        aria-label="Choose an app example"
      >
        {appIdeas.map((item, i) => (
          <button
            key={item.id}
            disabled={!hydrated}
            aria-pressed={active === i}
            onClick={() => choose(i)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        className={`playground-panel example-${idea.id}`}
        onFocusCapture={() => setPlaying(false)}
        onPointerEnter={() => setPlaying(false)}
      >
        <div className="playground-story">
          <h3>{detail.title}</h3>
          <ul>
            {detail.features.map((text) => (
              <li key={text}>
                <Check size={18} />
                {text}
              </li>
            ))}
          </ul>
          <div
            className="example-platforms"
            aria-label="Platforms for this example"
          >
            {detail.platforms.map((name) => (
              <span key={name} title={name} role="img" aria-label={name}>
                <BrandIcon name={name} />
              </span>
            ))}
          </div>
          <button
            className="primary-link"
            disabled={!hydrated}
            onClick={() => onUseIdea(idea.prompt)}
          >
            Build this app
            <ArrowUpRight size={20} />
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
          <div className="showcase-window">
            <div className="showcase-chrome">
              <LayoutGrid size={20} />
              <span>{idea.label}</span>
              <div className="demo-disclosure">
                <button
                  aria-label="About this interactive example"
                  aria-describedby={`demo-info-${idea.id}`}
                >
                  <Info size={18} />
                </button>
                <span id={`demo-info-${idea.id}`} role="tooltip">
                  Interactive example. Nothing is booked, saved, or sent.
                </span>
              </div>
            </div>
            <div className="showcase-body">
              <aside className="showcase-sidebar" aria-hidden="true">
                <CalendarDays size={24} />
                <strong>
                  {idea.id === "planner"
                    ? "Your week"
                    : idea.id === "game"
                      ? "Play again"
                      : idea.id === "operations"
                        ? "Your team"
                        : "Your space"}
                </strong>
                <span>Overview</span>
                <span>Saved</span>
                <span>Settings</span>
                <div className="showcase-month">
                  {"MTWTFSS".split("").map((d, i) => (
                    <span key={i}>{d}</span>
                  ))}
                  {Array.from({ length: 28 }, (_, i) => (
                    <i key={i}>{i + 1}</i>
                  ))}
                </div>
                <Search size={20} />
              </aside>
              <div className="showcase-screen" key={idea.id}>
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
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
