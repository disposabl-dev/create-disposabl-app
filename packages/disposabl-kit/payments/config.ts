export type Pricing = {
  currency: string;
  creditsPerDollar: number;
  featureId: string;
  monthly: { planId: string; price: number };
  topup: { planId: string; price: number };
};

/** Editable starter example. Apply matching changes to Autumn before accepting purchases. */
export const pricing: Pricing = {
  currency: "USD",
  creditsPerDollar: 100,
  featureId: "credits",
  monthly: { planId: "credits_monthly", price: 5 },
  topup: { planId: "credits_topup", price: 5 },
};

export type Purchase = "monthly" | "topup";

export function creditQuantity(purchase: Purchase, config: Pricing = pricing) {
  return config[purchase].price * config.creditsPerDollar;
}

export function formatPrice(amount: number, config: Pricing = pricing) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: config.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
