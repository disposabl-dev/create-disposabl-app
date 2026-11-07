import { useState, useRef, type ReactNode } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";

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

export function MarketingShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
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
          <button
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
          <div
            id="marketing-links"
            className={`marketing-links${open ? " is-open" : ""}`}
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("a")) setOpen(false);
            }}
          >
            <a href="/#platforms">Platforms</a>
            <a href="/why-disposabl">Why Disposabl</a>
            <a href="/#pricing">Pricing</a>
            <a href="/build">How it works</a>
            <a className="nav-github" href={repository}>
              GitHub <ArrowUpRight size={13} />
            </a>
            <a className="nav-start" href="/#start">
              Start building <ArrowUpRight size={15} />
            </a>
          </div>
        </nav>
      </header>
      {children}
      <footer className="launch-footer">
        <div className="launch-container">
          <div className="footer-top">
            <a className="wordmark" href="/">
              disposabl<span className="brand-period">.</span>
            </a>
            <p>Software for the life you actually live.</p>
            <a className="text-link" href={repository}>
              Open source. Open possibilities.
              <ArrowUpRight size={16} />
            </a>
          </div>
          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} Disposabl</span>
            <nav aria-label="Footer navigation">
              <a href="/stack">Tech stack</a>
              <a href="/build">Build guide</a>
              <a href="/why-disposabl">Why Disposabl</a>
              <a href="/legal/privacy">Privacy</a>
              <a href="/legal/terms">Terms</a>
              <a href="/login">Log in</a>
            </nav>
            <span>Made for makers, everywhere.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
