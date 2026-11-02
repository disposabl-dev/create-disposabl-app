import config from "../../disposabl.json";

const features: readonly string[] = config.features;
export const authenticationEnabled = features.includes("authentication");
