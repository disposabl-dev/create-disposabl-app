import type { Publisher } from "./types";

// Set these to the app publisher's details before launch.
export const publisher: Publisher = {
  operatorName: "",
  operatorAddress: "",
  country: "",
  privacyEmail: "",
  providers: [] as { name: string; purpose: string }[],
};
