import {
  ArrowUpRight,
  CalendarDays,
  ShoppingBag,
  Users,
  GraduationCap,
} from "lucide-react";

const outcomes = [
  {
    title: "Take bookings",
    icon: CalendarDays,
    className: "outcome-bookings",
    prompt:
      "I want an appointment booking app for my business. Customers should be able to choose a service, see available times, and request a booking. I need a simple calendar to manage them.",
  },
  {
    title: "Open your shop",
    icon: ShoppingBag,
    className: "outcome-shop",
    prompt:
      "I want an online shop for my products, with a catalog, product photos, and order management. Help me choose how to take payments and test the complete buying process.",
  },
  {
    title: "Bring your team together",
    icon: Users,
    className: "outcome-team",
    prompt:
      "I want a workspace for my team to manage projects, assign tasks, share updates, and see what needs attention. Include sign-in and appropriate access for each team member.",
  },
  {
    title: "Teach what you know",
    icon: GraduationCap,
    className: "outcome-learning",
    prompt:
      "I want a learning app where I can create lessons and quizzes, and learners can sign in and track their progress. Help me start with one complete lesson.",
  },
];

export function OutcomePicker({
  onSelect,
}: {
  onSelect: (prompt: string) => void;
}) {
  return (
    <section
      className="outcome-section launch-container"
      aria-labelledby="outcome-title"
    >
      <h2 id="outcome-title">What would you make?</h2>
      <div className="outcome-grid">
        {outcomes.map(({ title, icon: Icon, className, prompt }) => (
          <button
            type="button"
            className={`outcome-card ${className}`}
            key={title}
            onClick={() => onSelect(prompt)}
          >
            <span className="outcome-art" aria-hidden="true">
              <span />
              <Icon strokeWidth={1.4} />
            </span>
            <span className="outcome-title">
              {title}
              <ArrowUpRight size={24} />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
