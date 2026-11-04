import { test, expect } from "e2e";

test(
  "mobile home renders",
  { platforms: ["ios", "android"] },
  async ({ app, screen }) => {
    await app.open();
    await expect(screen.getByText("Welcome to Disposabl")).toBeVisible();
  },
);
