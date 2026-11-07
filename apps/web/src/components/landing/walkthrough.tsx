import { useState } from "react";
import {
  ArrowRight,
  Check,
  MessageSquare,
  CalendarDays,
  SlidersHorizontal,
  Monitor,
  Smartphone,
} from "lucide-react";
import { TextLink } from "./shell";

const steps = [
  {
    title: "Describe your idea",
    icon: MessageSquare,
    copy: "Tell your AI what you want people to be able to do.",
  },
  {
    title: "Build and try it",
    icon: CalendarDays,
    copy: "Try your app. Ask your AI to change anything that needs work.",
  },
  {
    title: "Make it yours",
    icon: SlidersHorizontal,
    copy: "Choose the details. Test it on your devices before you publish.",
  },
];
const bookingIdea =
  "An app for my business where customers can choose a service, pick a time, and book an appointment.";
export function AppWalkthrough({
  onUseIdea,
}: {
  onUseIdea: (idea: string) => void;
}) {
  const [step, setStep] = useState(1);
  const [time, setTime] = useState("10:30");
  const [accent, setAccent] = useState("coral");
  const [phone, setPhone] = useState(false);
  return (
    <section
      id="how-it-works"
      className="walkthrough-section launch-container"
      aria-labelledby="walkthrough-title"
    >
      <div className="section-heading">
        <h2 id="walkthrough-title">How it works</h2>
        <TextLink href="/build">See the full guide</TextLink>
      </div>
      <div className="walkthrough">
        <div
          className="walkthrough-steps"
          role="group"
          aria-label="Explore how it works"
        >
          {steps.map(({ title, icon: Icon, copy }, i) => (
            <button
              key={title}
              className="walkthrough-step"
              aria-pressed={step === i}
              aria-controls="walkthrough-example"
              onClick={() => setStep(i)}
            >
              <Icon size={24} />
              <span>
                <strong>{title}</strong>
                <span>{copy}</span>
              </span>
              <ArrowRight size={20} />
            </button>
          ))}
        </div>
        <div
          id="walkthrough-example"
          className={`walkthrough-canvas accent-${accent}`}
        >
          <div className="example-toolbar">
            <span>Booking app example</span>
            <div role="group" aria-label="Example device">
              <button
                type="button"
                aria-label="Show desktop example"
                aria-pressed={!phone}
                onClick={() => setPhone(false)}
              >
                <Monitor size={21} />
              </button>
              <button
                type="button"
                aria-label="Show phone example"
                aria-pressed={phone}
                onClick={() => setPhone(true)}
              >
                <Smartphone size={21} />
              </button>
            </div>
          </div>
          <div
            className={`example-stage${phone ? " example-phone" : ""}`}
            key={step}
          >
            {step === 0 ? (
              <div className="example-idea">
                <MessageSquare size={32} />
                <p>
                  “I'd like my customers to book an appointment without calling
                  me.”
                </p>
                <div className="example-requirements">
                  {[
                    "Choose a service",
                    "Pick an available time",
                    "Confirm a booking",
                  ].map((text) => (
                    <span key={text}>
                      <Check size={18} />
                      {text}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="booking-example">
                <div className="booking-symbol">
                  <CalendarDays size={28} />
                </div>
                <h3>Book a visit</h3>
                <p>Choose a time that works for you.</p>
                <div className="booking-date">
                  <span>Wednesday</span>
                  <strong>18 November</strong>
                </div>
                <div
                  className="booking-times"
                  role="group"
                  aria-label="Example appointment time"
                >
                  {["09:00", "10:30", "14:00"].map((value) => (
                    <button
                      key={value}
                      aria-pressed={time === value}
                      onClick={() => setTime(value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <div className="booking-selected" aria-live="polite">
                  <Check size={19} /> {time} selected
                </div>
                {step === 2 && (
                  <div
                    className="example-colors"
                    role="group"
                    aria-label="Example accent color"
                  >
                    {["coral", "blue", "green"].map((color) => (
                      <button
                        key={color}
                        className={`swatch-${color}`}
                        aria-label={`Use ${color} accent`}
                        aria-pressed={accent === color}
                        onClick={() => setAccent(color)}
                      >
                        {accent === color && <Check size={18} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            className="example-use"
            onClick={() => onUseIdea(bookingIdea)}
          >
            Use this idea <ArrowRight size={19} />
          </button>
        </div>
      </div>
    </section>
  );
}
