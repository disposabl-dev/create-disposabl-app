import config from "../../../disposabl.json";
import { platforms as platformOptions } from "../platforms";
import { features as featureOptions } from "../feature-options";

const platforms: Record<string, { detail: string; guide: string }> = {
  web: {
    detail: "A responsive website, ready to make your own.",
    guide: "web",
  },
  android: {
    detail: "A native app with shared screens and settings.",
    guide: "mobile",
  },
  ios: {
    detail: "A native app with shared screens and settings.",
    guide: "mobile",
  },
  macos: {
    detail: "Your website in a native desktop window.",
    guide: "desktop",
  },
  windows: {
    detail: "Your website in a native desktop window.",
    guide: "desktop",
  },
  linux: {
    detail: "Your website in a native desktop window.",
    guide: "desktop",
  },
  api: {
    detail: "Typed endpoints for your integrations.",
    guide: "backend",
  },
  mcp: {
    detail: "Tools that agents can discover and call.",
    guide: "backend",
  },
  cli: {
    detail: "Your app's API, from the terminal.",
    guide: "backend",
  },
  "typescript-sdk": {
    detail: "A typed client for your app.",
    guide: "backend",
  },
};
export const starterPlatforms = config.platforms.map((id) => ({
  id,
  title: platformOptions.find((option) => option.id === id)?.label ?? id,
  ...(platforms[id] ?? {
    detail: "Included in your workspace.",
    guide: "getting-started",
  }),
}));
export const starterFeatures = config.features.map(
  (id) => featureOptions.find((option) => option.id === id)?.label ?? id,
);
