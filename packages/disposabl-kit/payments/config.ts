export type Pricing = {
  currency: string;
  creditsPerDollar: number;
  featureId: string;
  monthly: { planId: string; price: number; creditMultiplier: number };
  topup: { planId: string; price: number };
};

/** Setup creates missing entries. Apply matching changes to existing Autumn plans manually. */
export const pricing: Pricing = {
  currency: "USD",
  creditsPerDollar: 100,
  featureId: "credits",
  monthly: { planId: "credits_monthly", price: 5, creditMultiplier: 1.5 },
  topup: { planId: "credits_topup", price: 5 },
};

export type Purchase = "monthly" | "topup";

export function creditQuantity(purchase: Purchase, config: Pricing = pricing) {
  // Credits are whole units; decimal prices must not leak floating-point noise.
  return Math.round(
    config[purchase].price *
      config.creditsPerDollar *
      (purchase === "monthly" ? config.monthly.creditMultiplier : 1),
  );
}

export function monthlyLabel(config: Pricing = pricing) {
  const monthlyRate = creditQuantity("monthly", config) / config.monthly.price;
  const topupRate = creditQuantity("topup", config) / config.topup.price;
  const percent = (monthlyRate / topupRate - 1) * 100;
  return Number.isFinite(percent) && percent > 0
    ? `Monthly · ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(percent)}% more`
    : "Monthly";
}

export function formatPrice(amount: number, config: Pricing = pricing) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: config.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
