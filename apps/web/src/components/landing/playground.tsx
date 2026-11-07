import { useHydrated } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowUpRight,
  Check,
  Copy,
  CalendarDays,
  Plus,
  ArrowRight,
} from "lucide-react";

export const appIdeas = [
  {
    id: "booking",
    label: "Booking app",
    title: "Let your customers book themselves in.",
    description: "Let people pick a time while you get on with your day.",
    prompt:
      "An app for my business where customers can choose a service, pick a time, and book an appointment.",
  },
  {
    id: "planner",
    label: "Daily planner",
    title: "Your day, on one screen.",
    description: "Your plans, your routines, your way of keeping it together.",
    prompt:
      "A personal planner for my tasks, routines, and weekly goals. I want to see what matters today and keep track of my progress.",
  },
  {
    id: "community",
    label: "Community app",
    title: "Bring your people together.",
    description:
      "Bring your club, neighborhood, or friends together around something you love.",
    prompt:
      "An app for my community to organize events, let members RSVP, and share updates. Each member should have their own account.",
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
  const idea = appIdeas[active];
  async function share() {
    const url = new URL("/", window.location.origin);
    url.searchParams.set("idea", idea.id);
    try {
      await navigator.clipboard.writeText(url.href);
      setShared("Link copied. Send it to someone you’d build with.");
    } catch {
      setShared(url.href);
    }
  }
  return (
    <section
      className="playground-section launch-container"
      aria-labelledby="playground-title"
    >
      <div className="playground-heading">
        <h2 id="playground-title">
          See what you
          <br />
          can make.
        </h2>
        <p>
          A few possibilities. Try these interactive examples, then start an app
          of your own.
        </p>
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
          <p>{idea.description}</p>
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
          <div className="demo-caption">
            <span>Interactive example</span>
            <span aria-hidden="true">↗</span>
          </div>
          {active === 0 ? (
            <BookingDemo disabled={!hydrated} />
          ) : active === 1 ? (
            <PlannerDemo disabled={!hydrated} />
          ) : (
            <CommunityDemo disabled={!hydrated} />
          )}
        </div>
      </div>
    </section>
  );
}

function BookingDemo({ disabled }: { disabled: boolean }) {
  const [day, setDay] = useState("Wed");
  const [time, setTime] = useState("10:30");
  const [booked, setBooked] = useState(false);
  return (
    <div className="demo-app booking-app">
      <div className="demo-brand">
        <span className="studio-mark" aria-hidden="true">
          s.
        </span>
        <strong>Studio sessions</strong>
      </div>
      <h4>
        A good time
        <br />
        to begin.
      </h4>
      <p>A one-to-one session, on your schedule.</p>
      <div className="demo-days" role="group" aria-label="Example booking day">
        {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d, i) => (
          <button
            key={d}
            disabled={disabled}
            aria-pressed={day === d}
            onClick={() => {
              setDay(d);
              setBooked(false);
            }}
          >
            <span>{d}</span>
            <strong>{16 + i}</strong>
          </button>
        ))}
      </div>
      <div
        className="demo-times"
        role="group"
        aria-label="Example appointment time"
      >
        {["09:00", "10:30", "14:00"].map((t) => (
          <button
            key={t}
            disabled={disabled}
            aria-pressed={time === t}
            onClick={() => {
              setTime(t);
              setBooked(false);
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <button
        className="demo-confirm"
        disabled={disabled}
        onClick={() => setBooked(!booked)}
      >
        {booked ? (
          <>
            <Check size={20} />
            Example booking confirmed
          </>
        ) : (
          <>
            Book {day} at {time}
            <ArrowRight size={20} />
          </>
        )}
      </button>
      <p className="demo-notice">Demo only. No appointment is created.</p>
    </div>
  );
}
function PlannerDemo({ disabled }: { disabled: boolean }) {
  const [tasks, setTasks] = useState([
    { title: "Make time for a walk", done: true },
    { title: "Finish the thing I started", done: false },
    { title: "Call someone I miss", done: false },
  ]);
  const [newTask, setNewTask] = useState("");
  const complete = tasks.filter((t) => t.done).length;
  return (
    <div className="demo-app planner-app">
      <div className="demo-brand">
        <span className="planner-mark" aria-hidden="true">
          ✳
        </span>
        <strong>A little space</strong>
      </div>
      <h4>
        Today is
        <br />a fresh start.
      </h4>
      <div className="planner-progress">
        <span>
          {complete} of {tasks.length} done
        </span>
        <div>
          <i style={{ width: `${(complete / tasks.length) * 100}%` }} />
        </div>
      </div>
      <div className="planner-tasks">
        {tasks.map((task, i) => (
          <button
            key={i}
            disabled={disabled}
            aria-pressed={task.done}
            onClick={() =>
              setTasks(
                tasks.map((t, j) => (j === i ? { ...t, done: !t.done } : t)),
              )
            }
          >
            <span className="task-check">
              {task.done && <Check size={16} />}
            </span>
            <span>{task.title}</span>
          </button>
        ))}
      </div>
      <form
        className="planner-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (newTask.trim() && tasks.length < 6) {
            setTasks([...tasks, { title: newTask.trim(), done: false }]);
            setNewTask("");
          }
        }}
      >
        <input
          aria-label="Add a demo task"
          placeholder={
            tasks.length < 6 ? "One more thing…" : "Your day is full"
          }
          maxLength={60}
          value={newTask}
          disabled={disabled || tasks.length >= 6}
          onChange={(e) => setNewTask(e.target.value)}
        />
        <button
          disabled={disabled || !newTask.trim() || tasks.length >= 6}
          aria-label="Add task"
        >
          <Plus size={22} />
        </button>
      </form>
      <p className="demo-notice">
        Try it here. Demo tasks reset when you leave.
      </p>
    </div>
  );
}
function CommunityDemo({ disabled }: { disabled: boolean }) {
  const [joined, setJoined] = useState(false);
  return (
    <div className="demo-app community-app">
      <div className="demo-brand">
        <span className="community-mark" aria-hidden="true">
          ↗
        </span>
        <strong>The weekend club</strong>
      </div>
      <div className="community-poster" aria-hidden="true">
        <span>
          GO
          <br />
          OUTSIDE.
        </span>
        <svg viewBox="0 0 200 160">
          <path d="M0 160 70 30 110 100 145 55 200 160Z" fill="currentColor" />
          <circle cx="160" cy="20" r="15" fill="currentColor" />
        </svg>
      </div>
      <div className="community-event">
        <h4>
          A walk. A coffee.
          <br />
          Some new faces.
        </h4>
        <p>
          <CalendarDays size={19} />
          Saturday · 9:00 am
        </p>
      </div>
      <button
        className="demo-confirm"
        disabled={disabled}
        aria-pressed={joined}
        onClick={() => setJoined(!joined)}
      >
        {joined ? (
          <>
            <Check size={20} />
            You’re on the example guest list
          </>
        ) : (
          <>
            Count me in
            <ArrowUpRight size={20} />
          </>
        )}
      </button>
      <p className="demo-notice">Demo event. No real RSVP is sent.</p>
    </div>
  );
}
