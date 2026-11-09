// Used only by the isolated website fixture; the product configuration is unchanged.
import config from "../../../../disposabl.json";
const features: readonly string[] = config.features;
export const analyticsEnabled = features.includes("analytics");
export const authenticationEnabled = features.includes("authentication");
export const docsEnabled = features.includes("docs");
export const paymentsEnabled = true;
