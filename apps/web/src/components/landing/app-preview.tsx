import {
  Check,
  Plus,
  CalendarDays,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const tasks = [
  { time: "8:00", title: "Morning run", tag: "Personal", color: "green" },
  {
    time: "10:30",
    title: "Design something new",
    tag: "Work",
    color: "blue",
  },
  {
    time: "12:00",
    title: "Lunch with Maya",
    tag: "Friends",
    color: "peach",
  },
];

// Illustrative interface, not a claim that this app was generated or is connected.
export function AppPreview() {
  return (
    <figure className="app-preview">
      <div className="preview-scene" aria-hidden="true">
        <div className="demo-browser">
          <div className="demo-browser-bar">
            <span className="traffic-lights">
              <i />
              <i />
              <i />
            </span>
            <span>weekday.app</span>
            <Plus size={13} />
          </div>
          <div className="demo-layout">
            <aside className="demo-sidebar">
              <strong>
                <CalendarDays size={19} /> weekday
              </strong>
              <span className="demo-current">
                <LayoutGrid size={14} /> My week
              </span>
              <span>
                <CalendarDays size={14} /> Calendar
              </span>
              <div className="demo-sidebar-bottom">
                <span className="demo-avatar">J</span>Jamie Park
              </div>
            </aside>
            <div className="demo-content">
              <div className="demo-heading">
                <div>
                  <p>Monday, November 9</p>
                  <h3>Your week.</h3>
                </div>
                <span className="demo-add">
                  <Plus size={15} /> Add a plan
                </span>
              </div>
              <div className="demo-week">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                  (day, i) => (
                    <div
                      className={i === 0 ? "demo-day selected" : "demo-day"}
                      key={day}
                    >
                      <span>{day}</span>
                      <b>{9 + i}</b>
                    </div>
                  ),
                )}
              </div>
              <div className="demo-cards">
                <div className="demo-schedule">
                  {tasks.map((task) => (
                    <div className={`demo-task ${task.color}`} key={task.title}>
                      <span>{task.time}</span>
                      <div>
                        <b>{task.title}</b>
                        <small>{task.tag}</small>
                      </div>
                      <span className="demo-task-check">
                        <Check size={12} />
                      </span>
                    </div>
                  ))}
                </div>
                <div className="demo-note">
                  <span>For the weekend</span>
                  <p>Out of office.</p>
                  <ul>
                    <li>Book the cabin</li>
                    <li>Plan the trail</li>
                    <li>Pack the camera</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="demo-phone">
          <div className="demo-phone-island" />
          <div className="demo-phone-heading">
            <CalendarDays size={22} />
            <span>weekday</span>
          </div>
          <p>Monday, November 9</p>
          <h3>Monday.</h3>
          <div className="demo-phone-date">
            <ChevronLeft size={14} />
            <span>M</span>
            <span className="selected">9</span>
            <span>10</span>
            <span>11</span>
            <ChevronRight size={14} />
          </div>
          {tasks.map((task) => (
            <div className={`phone-task ${task.color}`} key={task.title}>
              <small>{task.time}</small>
              <b>{task.title}</b>
            </div>
          ))}
          <div className="demo-phone-home" />
        </div>
      </div>
      <figcaption>
        One idea, on every screen. <span>Illustrative app.</span>
      </figcaption>
    </figure>
  );
}
