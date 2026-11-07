import config from "../../disposabl.json";

const features: readonly string[] = config.features;
export const analyticsEnabled = features.includes("analytics");
export const authenticationEnabled = features.includes("authentication");
export const paymentsEnabled = features.includes("payments");
export const docsEnabled = features.includes("docs");
