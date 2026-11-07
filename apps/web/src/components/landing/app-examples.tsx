import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  Plus,
} from "lucide-react";
import "./app-previews.css";
import { PhonePreview } from "./phone-preview";

export function BookingDemo({ disabled }: { disabled: boolean }) {
  const [day, setDay] = useState("Wed");
  const [time, setTime] = useState("10:30");
  const [booked, setBooked] = useState(false);
  return (
    <div className="preview-booking booking-app">
      <header>
        <strong>
          <span>◒</span> STILL STUDIO
        </strong>
        <span>Services&nbsp;&nbsp; · &nbsp;&nbsp;About</span>
      </header>
      <div className="booking-layout">
        <div className="booking-intro">
          <h4>
            Make space
            <br />
            to feel good.
          </h4>
          <p>Thoughtful sessions, made for your day.</p>
          <div className="booking-service">
            <strong>Personal session</strong>
            <span>60 minutes · In studio</span>
          </div>
          <div className="booking-service">
            <strong>Follow-up session</strong>
            <span>30 minutes · In studio</span>
          </div>
        </div>
        <div className="booking-picker">
          <h4>Book a session</h4>
          <p>Choose a day and time</p>
          <div
            className="preview-days"
            role="group"
            aria-label="Example booking day"
          >
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
            className="preview-times"
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
            className="booking-submit"
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
      </div>
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
    <PhonePreview app="Daily planner" variant="planner">
      <div className="preview-planner planner-app">
        <div className="planner-main">
          <header>
            <strong>Daylight</strong>
            <span>☼</span>
          </header>
          <h4>Good morning.</h4>
          <p>Monday, May 18</p>
          <div className="planner-progress">
            <span>
              {complete} of {tasks.length} done
            </span>
            <div>
              <i style={{ width: `${(complete / tasks.length) * 100}%` }} />
            </div>
          </div>
          <div className="planner-section-title">
            <strong>Today's tasks</strong>
            <span>{tasks.length} tasks</span>
          </div>
          <div className="planner-tasks">
            {tasks.map((task, i) => (
              <button
                key={i}
                disabled={disabled}
                aria-pressed={task.done}
                onClick={() =>
                  setTasks(
                    tasks.map((t, j) =>
                      j === i ? { ...t, done: !t.done } : t,
                    ),
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
              id="example-task"
              aria-label="Add a demo task"
              placeholder={
                tasks.length < 6 ? "Add a task…" : "Your day is full"
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
              <Plus size={20} />
            </button>
          </form>
          <div className="planner-schedule">
            <strong>Coming up</strong>
            <div>
              <span>10:30</span> Focus time <span>↗</span>
            </div>
            <div>
              <span>16:00</span> A little fresh air <span>↗</span>
            </div>
          </div>
        </div>
      </div>
    </PhonePreview>
  );
}
export function CommunityDemo({ disabled }: { disabled: boolean }) {
  const [joined, setJoined] = useState(false);
  return (
    <div className="preview-community community-app">
      <header>
        <strong>
          THE WEEKEND CLUB<span>✳</span>
        </strong>
        <div>Journal&nbsp;&nbsp; Events&nbsp;&nbsp; Members</div>
      </header>
      <div className="community-layout">
        <div className="community-cover">
          <img src="/landing/community.jpg" alt="" />
          <div>
            <strong>
              Good things happen
              <br />
              outside.
            </strong>
          </div>
        </div>
        <div className="community-content">
          <div className="community-event">
            <h4>
              A walk. A coffee.
              <br />
              Some new faces.
            </h4>
            <p>
              <CalendarDays size={19} /> Saturday · 9:00 am
            </p>
            <p>Meet at the park for a relaxed morning together.</p>
            <button
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
                  Count me in <ArrowUpRight size={20} />
                </>
              )}
            </button>
          </div>
          <aside>
            <strong>From the club</strong>
            <p>Fresh air, good company, and a slower start to the weekend.</p>
            <div className="community-avatars" aria-hidden="true">
              <span>A</span>
              <span>M</span>
              <span>J</span>
            </div>
            <span>See you out there.</span>
          </aside>
        </div>
      </div>
    </div>
  );
}
