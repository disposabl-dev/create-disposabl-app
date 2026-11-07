import { useHydrated } from "@tanstack/react-router";
import { useState, useRef, type ReactNode } from "react";
import { ArrowUpRight, Menu, X, Sun, Moon } from "lucide-react";
import { useTheme } from "@disposabl/disposabl-kit/client/lib/theme";
import { BrandIcon } from "./brand-icon";
import { docsEnabled } from "@disposabl/disposabl-kit/features";

export const repository =
  "https://github.com/disposabl-dev/create-disposabl-app";
export function TextLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a className="text-link" href={href}>
      {children}
      <ArrowUpRight size={16} aria-hidden="true" />
    </a>
  );
}
export function MarketingShell({
  children,
  onStart,
}: {
  children: ReactNode;
  onStart?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const hydrated = useHydrated();
  const { resolvedTheme, setTheme } = useTheme();
  const menuButton = useRef<HTMLButtonElement>(null);
  return (
    <div className="launch-site">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header
        className="launch-nav"
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            setOpen(false);
            menuButton.current?.focus();
          }
        }}
      >
        <nav className="launch-container" aria-label="Website navigation">
          <a className="wordmark" href="/" aria-label="Disposabl home">
            <img src="/disposabl-logo.svg" alt="" width={34} height={34} />
            <span>
              disposabl<span className="brand-period">.</span>
            </span>
          </a>
          <div
            id="marketing-links"
            className={`marketing-links${open ? " is-open" : ""}`}
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("a,button"))
                setOpen(false);
            }}
          >
            <a href="/build">How it works</a>
            <a href="/why-disposabl">Why Disposabl</a>
            <a href="/#pricing">Pricing</a>
            <a href="/stack">Tech stack</a>
            {docsEnabled && <a href="/docs/">Docs</a>}
            <a
              className="nav-github"
              href={repository}
              aria-label="GitHub"
              title="GitHub"
            >
              <BrandIcon name="GitHub" />
            </a>
            {onStart ? (
              <button
                className="nav-start"
                disabled={!hydrated}
                onClick={onStart}
              >
                Get started <ArrowUpRight size={16} />
              </button>
            ) : (
              <a className="nav-start" href="/#start">
                Get started <ArrowUpRight size={16} />
              </a>
            )}
          </div>
          <div className="nav-controls">
            <button
              disabled={!hydrated}
              type="button"
              className="theme-toggle"
              aria-label="Toggle light and dark mode"
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
            >
              <Sun className="theme-sun" size={22} aria-hidden="true" />
              <Moon className="theme-moon" size={22} aria-hidden="true" />
            </button>
            <button
              disabled={!hydrated}
              ref={menuButton}
              className="mobile-menu-button"
              type="button"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="marketing-links"
              onClick={() => setOpen(!open)}
            >
              {open ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </nav>
      </header>
      {children}
      <footer className="launch-footer">
        <div className="launch-container">
          <div className="footer-invitation">
            <h2>Yours to make.</h2>
            {onStart ? (
              <button
                disabled={!hydrated}
                onClick={onStart}
                aria-label="Start making your app"
              >
                <ArrowUpRight size={54} />
              </button>
            ) : (
              <a href="/#start" aria-label="Start making your app">
                <ArrowUpRight size={54} />
              </a>
            )}
          </div>
          <div className="footer-directory">
            <p>
              Your AI.
              <br />
              Your computer.
              <br />
              Your code.
            </p>
            <nav aria-label="Explore Disposabl">
              <a href="/build">How it works</a>
              <a href="/stack">Tech stack</a>
              <a href="/why-disposabl">Why Disposabl</a>
              <a href="/#pricing">Pricing</a>
            </nav>
            <nav aria-label="Footer navigation">
              <a href="/legal/privacy">Privacy</a>
              <a href="/legal/terms">Terms</a>
              <a href="/login">Log in</a>
              <a
                className="footer-source"
                href={repository}
                aria-label="Source code on GitHub"
              >
                <BrandIcon name="GitHub" />
                Open source
                <ArrowUpRight size={18} />
              </a>
            </nav>
          </div>
          <a href="/" className="footer-signature" aria-label="Disposabl home">
            disposabl<span>.</span>
          </a>
          <div className="footer-colophon">
            <span>© {new Date().getFullYear()} Disposabl</span>
            <a href="#main">Back to top ↑</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
