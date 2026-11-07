import {
  ArrowRight,
  Check,
  Fingerprint,
  Globe,
  MessageSquare,
  ShieldCheck,
  Database,
} from "lucide-react";
import { TextLink } from "./shell";

export function Foundation() {
  return (
    <section
      className="foundation-section"
      id="how-it-works"
      aria-labelledby="foundation-title"
    >
      <div className="launch-container">
        <div className="foundation-intro">
          <h2 id="foundation-title">
            An idea shouldn’t
            <br />
            start from zero.
          </h2>
          <p>
            Getting a screen from AI is a start. An app also needs accounts,
            saved data, and a way to reach people. Disposabl connects those
            parts before you begin.
          </p>
        </div>
        <div
          className="foundation-map"
          aria-label="Your idea, the included foundations, and your app"
        >
          <div className="foundation-input">
            <MessageSquare size={32} />
            <p>
              “I wish there was
              <br />
              an app for…”
            </p>
          </div>
          <ArrowRight className="flow-arrow" size={30} aria-hidden="true" />
          <div className="foundation-engine">
            <div className="foundation-engine-title">
              <img src="/disposabl-logo.svg" width={32} height={32} alt="" />
              <strong>disposabl</strong>
            </div>
            <div>
              {[
                { Icon: Fingerprint, label: "People can sign in" },
                { Icon: Database, label: "Their work is saved" },
                { Icon: ShieldCheck, label: "Starter tests included" },
                { Icon: Globe, label: "A path to publishing" },
              ].map(({ Icon, label }) => (
                <span key={label}>
                  <Icon size={22} />
                  {label}
                  <Check size={18} />
                </span>
              ))}
            </div>
          </div>
          <ArrowRight className="flow-arrow" size={30} aria-hidden="true" />
          <div className="foundation-output">
            <span className="app-monogram">a</span>
            <p>
              Your app.
              <br />
              Built with your AI.
            </p>
          </div>
        </div>
        <div className="foundation-bottom">
          <p>
            You describe the features. Your AI builds them. You try the app and
            decide what to change.
          </p>
          <TextLink href="/build">See how to start</TextLink>
        </div>
      </div>
    </section>
  );
}
