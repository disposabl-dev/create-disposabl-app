"use client";

import { createContext, useEffect, useRef } from "react";
import * as CookieConsent from "vanilla-cookieconsent";
import "../styles/cookie-consent.css";

export const CookiePreferencesContext = createContext(false);

// Serialize async setup and teardown, including React StrictMode.
let lifecycle = Promise.resolve();

export function CookieConsentBanner({
  onAnalyticsChange,
  onInvalidate,
}: {
  onAnalyticsChange: (allowed: boolean) => void;
  onInvalidate: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;
    let started = false;
    const container = root.current;
    const update = () => onAnalyticsChange(acceptedCookieCategory("analytics"));
    lifecycle = lifecycle
      .then(async () => {
        if (isCancelled() || !container) return;
        started = true;
        await CookieConsent.run({
          root: container,
          mode: "opt-in",
          hideFromBots: false,
          cookie: {
            name: "disposabl_cookie_consent_v1",
            expiresAfterDays: 182,
            sameSite: "Lax",
            useLocalStorage: true,
          },
          categories: {
            necessary: { enabled: true, readOnly: true },
            analytics: { enabled: false },
          },
          language: {
            default: "en",
            translations: {
              en: {
                consentModal: {
                  title: "Cookie preferences",
                  description:
                    "We use necessary cookies and, with your permission, analytics to improve Disposabl.",
                  acceptAllBtn: "Accept all",
                  acceptNecessaryBtn: "Reject analytics",
                  showPreferencesBtn: "Preferences",
                },
                preferencesModal: {
                  title: "Cookie preferences",
                  acceptAllBtn: "Accept all",
                  acceptNecessaryBtn: "Reject analytics",
                  savePreferencesBtn: "Save preferences",
                  closeIconLabel: "Close",
                  sections: [
                    {
                      title: "Necessary",
                      description:
                        "Required for sign-in and saved preferences.",
                      linkedCategory: "necessary",
                    },
                    {
                      title: "Analytics",
                      description:
                        "Optional usage information helps improve Disposabl.",
                      linkedCategory: "analytics",
                    },
                  ],
                },
              },
            },
          },
          onConsent: update,
          onChange: update,
        });
        if (!isCancelled()) update();
      })
      .catch((error) => {
        console.error("Cookie preferences unavailable", error);
        onAnalyticsChange(false);
      });
    return () => {
      cancelled = true;
      onInvalidate();
      lifecycle = lifecycle.then(() => {
        if (started) CookieConsent.reset(false);
      });
    };
  }, [onAnalyticsChange, onInvalidate]);
  return <div ref={root} className="cookie-consent" />;
}

export function showCookiePreferences() {
  CookieConsent.showPreferences();
}
export function acceptedCookieCategory(category: string) {
  try {
    const value = JSON.parse(
      localStorage.getItem("disposabl_cookie_consent_v1") ?? "null",
    );
    return (
      Number.isFinite(value?.expirationTime) &&
      value.expirationTime > Date.now() &&
      CookieConsent.validConsent() &&
      CookieConsent.acceptedCategory(category)
    );
  } catch {
    return false;
  }
}
