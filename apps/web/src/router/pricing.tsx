import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { paymentsEnabled } from "@disposabl/disposabl-kit/features";
import { Pricing as Checkout } from "../../../../packages/disposabl-kit/client/routes/pricing";
import {
  creditQuantity,
  formatPrice,
  monthlyLabel,
  pricing,
} from "../../../../packages/disposabl-kit/payments/config";
import { MarketingShell, TextLink } from "../components/landing/shell";
import { marketingHead } from "../components/landing/metadata";
import "../components/landing/home.css";

export const Route = createFileRoute("/_providers/pricing")({
  head: () => marketingHead("/pricing"),
  component: PricingPage,
});

function PricingPage() {
  const plans = [
    {
      name: "Local",
      price: "Free",
      details: [
        "Unlimited app projects",
        "Every platform included",
        "Your AI, computer, and code",
        "AI and cloud costs billed separately",
      ],
    },
    {
      name: monthlyLabel(),
      price: `${formatPrice(pricing.monthly.price)} / month`,
      details: [
        `${creditQuantity("monthly")} credits each month`,
        "Monthly credits expire",
        "Work on a remote computer",
      ],
    },
    {
      name: "Agent Mode one-time",
      price: `${formatPrice(pricing.topup.price)} once`,
      details: [
        `${creditQuantity("topup")} credits`,
        "Credits do not expire",
        "Work on a remote computer",
      ],
    },
  ];
  return (
    <MarketingShell>
      <main id="main" className="pricing-page">
        <section className="pricing-section">
          <div className="launch-container">
            <div className="pricing-intro">
              <h1>Build your way.</h1>
              <p>Start free on your computer, or use credits for Agent Mode.</p>
              <p>
                Agent compute costs 10 credits per 10-minute window. AI is
                currently included.
              </p>
            </div>
            <div className="pricing-grid">
              {plans.map((plan) => (
                <article className="price-card" key={plan.name}>
                  <h2>{plan.name}</h2>
                  <p className="price-number">{plan.price}</p>
                  <ul>
                    {plan.details.map((detail) => (
                      <li key={detail}>
                        <Check size={20} aria-hidden="true" />
                        {detail}
                      </li>
                    ))}
                  </ul>
                  {plan.name === "Local" && (
                    <TextLink href="/#start">Start building</TextLink>
                  )}
                </article>
              ))}
            </div>
            {paymentsEnabled ? (
              <Checkout />
            ) : (
              <p className="pricing-availability">
                Agent Mode purchases are not available on this website yet.
              </p>
            )}
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
