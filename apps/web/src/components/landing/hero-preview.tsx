import { useState } from "react";
import {
  ArrowUpRight,
  Check,
  MapPin,
  Plus,
  CalendarDays,
  Users,
  Compass,
} from "lucide-react";
import { useHydrated } from "@tanstack/react-router";

export function HeroPreview() {
  const [joined, setJoined] = useState(false);
  const hydrated = useHydrated();
  return (
    <div
      className="hero-workbench"
      aria-label="Interactive example of a community app"
    >
      <div className="workbench-orbit" aria-hidden="true" />
      <div className="workbench-browser">
        <div className="browser-chrome" aria-hidden="true">
          <span />
          <span />
          <span />
          <div>sunday.club</div>
          <ArrowUpRight size={16} />
        </div>
        <div className="club-nav">
          <strong>
            <span className="club-mark">s</span> sunday club
          </strong>
          <span>
            <Compass size={18} /> Explore
          </span>
          <div className="club-avatar">J</div>
        </div>
        <div className="club-content">
          <div className="club-poster" aria-hidden="true">
            <div className="poster-sun" />
            <div className="poster-hill hill-back" />
            <div className="poster-hill hill-front" />
            <div className="poster-path" />
            <strong>
              A little more
              <br />
              outside.
            </strong>
            <span className="poster-stamp">
              <ArrowUpRight size={32} />
            </span>
          </div>
          <div className="club-event">
            <div>
              <h3>The Sunday walk</h3>
              <p>
                <MapPin size={16} /> Riverside park
              </p>
            </div>
            <button
              disabled={!hydrated}
              onClick={() => setJoined(!joined)}
              aria-label={joined ? "Leave example walk" : "Join example walk"}
            >
              {joined ? <Check size={18} /> : <Plus size={18} />}{" "}
              {joined ? "You're in" : "Join us"}
            </button>
          </div>
        </div>
      </div>
      <div className="workbench-phone" aria-hidden="true">
        <div className="mini-island" />
        <div className="mini-top">
          <span className="club-mark">s</span>
          <span>Sunday</span>
          <Plus size={20} />
        </div>
        <h3>
          See you
          <br />
          outside.
        </h3>
        <div className="phone-event-art">
          <span />
          <span />
          <span />
          <Compass size={48} />
        </div>
        <strong>The Sunday walk</strong>
        <p>Sunday · 9:00 am</p>
        <div className="mini-join">
          {joined ? <Check size={18} /> : <Plus size={18} />}{" "}
          {joined ? "You're in" : "Join the walk"}
        </div>
        <div className="mini-bottom">
          <Compass size={20} />
          <CalendarDays size={20} />
          <Users size={20} />
        </div>
        <div className="mini-home" />
      </div>
    </div>
  );
}
