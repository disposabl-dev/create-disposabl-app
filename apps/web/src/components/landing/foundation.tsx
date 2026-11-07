import { Check, Database, Plus, UserRound } from "lucide-react";
import "./foundation.css";

export function Foundation() {
  return (
    <section
      className="app-foundation"
      id="how-it-works"
      aria-labelledby="foundation-title"
    >
      <div className="launch-container">
        <h2 id="foundation-title">The parts your app needs.</h2>
        <div className="app-foundation-grid">
          <article className="foundation-card">
            <details>
              <summary>
                Sign-in &amp; saved data <Plus size={22} aria-hidden="true" />
              </summary>
              <p>
                People can sign in and return to their saved work across your
                selected apps.
              </p>
            </details>
            <div
              className="foundation-visual foundation-accounts"
              aria-hidden="true"
            >
              <div>
                <UserRound size={22} />
                <span>Account</span>
                <Check size={20} />
              </div>
              <div>
                <Database size={22} />
                <span>Saved data</span>
                <Check size={20} />
              </div>
            </div>
          </article>
          <article className="foundation-card">
            <details>
              <summary>
                Optional analytics <Plus size={22} aria-hidden="true" />
              </summary>
              <p>
                Connect your own analytics account to understand how people use
                your published app.
              </p>
            </details>
            <div
              className="foundation-visual foundation-chart"
              aria-hidden="true"
            >
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
          </article>
          <article className="foundation-card">
            <details>
              <summary>
                Build. Test. Improve. <Plus size={22} aria-hidden="true" />
              </summary>
              <p>
                Starter checks help your AI test changes. Try ideas, compare
                results, and keep improving.
              </p>
            </details>
            <div
              className="foundation-visual foundation-cycle"
              aria-hidden="true"
            >
              <svg viewBox="0 0 300 170" fill="none">
                <path
                  d="M80 40H225Q265 40 265 80Q265 130 210 130H75Q35 130 35 90Q35 40 80 40"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="m177 35 8 5-8 5M120 125l-8 5 8 5"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
              <span>Build</span>
              <span>Test</span>
              <span>Improve</span>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
