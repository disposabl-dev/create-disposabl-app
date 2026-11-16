import { setupLegacyGoogleMigration } from "@convex-dev/auth/server";
import { components } from "./_generated/api";

// Operators run this internal mutation repeatedly after deploying the stable
// component and quiescing application-specific authentication writes.
export const advance = setupLegacyGoogleMigration(
  components.auth,
  components.authGoogle,
);
