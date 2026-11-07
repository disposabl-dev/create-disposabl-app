import { useState } from "react";
import {
  Check,
  ChevronRight,
  Compass,
  CalendarDays,
  MapPin,
  Plus,
} from "lucide-react";
import { BrandIcon } from "./brand-icon";
import "./hero-preview.css";

export function HeroPreview() {
  const [view, setView] = useState("Desktop");
  const [saved, setSaved] = useState(false);
  return (
    <div className="product-stage" data-enter-media>
      <div
        className="preview-switch"
        role="group"
        aria-label="Preview an app on different platforms"
      >
        {(
          [
            ["Desktop", "Windows"],
            ["Mobile", "Apple"],
            ["Web", "Web"],
          ] as const
        ).map(([name, icon]) => (
          <button
            key={name}
            aria-pressed={view === name}
            onClick={() => setView(name)}
          >
            <BrandIcon name={icon} />
            {name}
          </button>
        ))}
      </div>
      <div className={`trip-window ${view === "Mobile" ? "is-mobile" : ""}`}>
        <div className="trip-topbar">
          <Compass size={22} />
          <strong>Weekend plans</strong>
          <span />
          <button
            aria-label={saved ? "Remove example trip" : "Save example trip"}
            onClick={() => setSaved(!saved)}
          >
            {saved ? <Check size={20} /> : <Plus size={20} />}
          </button>
        </div>
        <div className="trip-cover">
          <img
            src="/landing/lake.jpg"
            alt="A mountain lake surrounded by pine forest"
            width={500}
            height={333}
            fetchPriority="high"
          />
          <div>
            <p>A weekend outdoors</p>
            <strong className="trip-title">Room to roam.</strong>
          </div>
        </div>
        <div className="trip-content">
          <div className="trip-heading">
            <strong className="itinerary-title">Your itinerary</strong>
            <CalendarDays size={22} />
          </div>
          <div className="trip-item">
            <span className="trip-time">Friday</span>
            <div>
              <strong>Take the scenic route</strong>
              <span>
                <MapPin size={16} /> Lakeside trail
              </span>
            </div>
            <ChevronRight size={20} />
          </div>
          <div className="trip-item">
            <span className="trip-time">Saturday</span>
            <div>
              <strong>A day by the water</strong>
              <span>
                <MapPin size={16} /> Pine forest
              </span>
            </div>
            <ChevronRight size={20} />
          </div>
          <div className="trip-save" aria-live="polite">
            {saved
              ? "Saved to your example trips"
              : "Your plans, in your pocket."}
            <span>
              {saved ? <Check size={20} /> : <BrandIcon name="Apple" />}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
