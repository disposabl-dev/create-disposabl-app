import { defineConfig } from "vite";
import { resolve } from "node:path";
const fixture = import.meta.dirname;
export default defineConfig({
  root: fixture,
  optimizeDeps: { exclude: ["react-native"] },
  define: {
    "process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY": JSON.stringify("fixture"),
    "process.env.EXPO_PUBLIC_REVENUECAT_IOS_MONTHLY_PRODUCT":
      JSON.stringify("fixture-monthly"),
    "process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY": "undefined",
    "process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_MONTHLY_PRODUCT": "undefined",
  },
  plugins: [
    {
      name: "billing-fixture",
      enforce: "pre",
      resolveId(id, importer) {
        if (importer?.includes("features/management/payment-gate")) {
          if (id === "react-native") return resolve(fixture, "native.tsx");
          if (id.endsWith("/billing/session"))
            return resolve(fixture, "session.ts");
          if (id.endsWith("/billing/web-checkout"))
            return resolve(fixture, "web-checkout.ts");
          if (id.endsWith("/billing/use-topup"))
            return resolve(fixture, "topup.ts");
          if (id === "../studio/ui") return resolve(fixture, "action.tsx");
        }
        if (id === "@tanstack/react-router")
          return resolve(fixture, "router.ts");
        if (id === "convex/react") return resolve(fixture, "convex.ts");
        if (id === "@convex-dev/auth/react") return resolve(fixture, "auth.ts");
        if (
          id === "../../features" &&
          importer?.includes("client/routes/pricing")
        )
          return resolve(fixture, "features.ts");
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    port: 3450,
    strictPort: true,
    fs: {
      allow: [
        resolve(fixture, "../../../.."),
        resolve(fixture, "../../../../node_modules"),
      ],
    },
  },
});
