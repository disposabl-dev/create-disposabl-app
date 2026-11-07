import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  Plus,
} from "lucide-react";

export function BookingDemo({ disabled }: { disabled: boolean }) {
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
      <h4>Book a session</h4>
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
    </div>
  );
}
export function PlannerDemo({ disabled }: { disabled: boolean }) {
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
        <strong>Daily planner</strong>
      </div>
      <h4>Today</h4>
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
      <label className="planner-label" htmlFor="example-task">
        Add a task
      </label>
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
          id="example-task"
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
    </div>
  );
}
export function CommunityDemo({ disabled }: { disabled: boolean }) {
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
    </div>
  );
}
