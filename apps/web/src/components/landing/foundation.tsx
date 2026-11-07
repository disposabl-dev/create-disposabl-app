import {
  Check,
  FileText,
  RefreshCw,
  Database,
  ArrowUpRight,
} from "lucide-react";
import { BrandIcon } from "./brand-icon";
import "./foundation.css";

export function Foundation() {
  return (
    <section
      className="app-foundation"
      id="how-it-works"
      aria-labelledby="foundation-title"
    >
      <div className="launch-container">
        <h2 id="foundation-title">Built in before you begin.</h2>
        <div className="foundation-layout">
          <article className="foundation-feature foundation-feature-large">
            <div className="foundation-copy">
              <h3>Accounts and data, connected.</h3>
              <p>
                Give people a place to sign in and come back to their saved
                work, across your selected apps.
              </p>
            </div>
            <div className="foundation-account-visual" aria-hidden="true">
              <div className="foundation-signin">
                <strong>Welcome back</strong>
                <span>Email</span>
                <div>you@example.com</div>
                <span>Password</span>
                <div>••••••••</div>
                <b>Sign in</b>
              </div>
              <div className="foundation-saved">
                <div>
                  <Database size={20} /> Your saved work
                </div>
                <strong>Weekly plan</strong>
                <span>Pick up where you left off</span>
                <div className="foundation-platforms">
                  <BrandIcon name="Web" />
                  <BrandIcon name="iOS" />
                  <BrandIcon name="Android" />
                </div>
              </div>
            </div>
          </article>
          <article className="foundation-feature foundation-feature-checks">
            <div className="foundation-copy">
              <h3>Test and publish</h3>
              <p>
                Starter tests and publishing workflows give your AI a path from
                first version to real users.
              </p>
            </div>
            <div className="foundation-pipeline" aria-hidden="true">
              <div>
                <Check size={20} />
                <span>Web &amp; backend tests</span>
              </div>
              <div>
                <Check size={20} />
                <span>Mobile app build</span>
              </div>
              <div>
                <ArrowUpRight size={20} />
                <span>Preview &amp; release</span>
              </div>
            </div>
          </article>
          <article className="foundation-feature foundation-feature-content">
            <div className="foundation-copy">
              <h3>Docs and a blog</h3>
              <p>Add a documentation site, or ask your AI to add a blog.</p>
            </div>
            <div className="foundation-docs" aria-hidden="true">
              <nav>
                <strong>Guides</strong>
                <span>Getting started</span>
                <span>Using your app</span>
              </nav>
              <div>
                <FileText size={21} />
                <strong>Getting started</strong>
                <p>
                  Welcome! Here’s how to get started and make the most of your
                  app.
                </p>
              </div>
            </div>
          </article>
          <article className="foundation-feature foundation-feature-extra">
            <div>
              <RefreshCw size={24} aria-hidden="true" />
              <h3>More ways to grow.</h3>
              <p>
                Choose optional analytics and payments. Support for 85+
                languages is coming soon.
              </p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
