import project from "../../../package.json";
import { authenticationEnabled, analyticsEnabled } from "../features";

// Public draft details. Each app publisher must review these before launch.
export const legalConfig = {
  appName: project.name === "disposabl-dev" ? "Disposabl" : project.name,
  operatorName: "",
  operatorAddress: "",
  country: "",
  privacyEmail: "",
  effectiveDate: "",
  reviewed: false,
  retention: "",
  internationalTransfers: "",
  audience: "",
  providers: [
    {
      name: "Convex",
      purpose: "Application database, hosting, and account authentication",
    },
    ...(authenticationEnabled
      ? [
          {
            name: "Google",
            purpose:
              "Basic account identity when Google sign-in is configured and you choose it",
          },
        ]
      : []),
    ...(analyticsEnabled
      ? [
          {
            name: "PostHog",
            purpose: "Usage analytics when configured by the publisher",
          },
        ]
      : []),
  ],
};

export function legalIsDraft() {
  return (
    !legalConfig.reviewed ||
    [
      legalConfig.operatorName,
      legalConfig.operatorAddress,
      legalConfig.country,
      legalConfig.privacyEmail,
      legalConfig.effectiveDate,
      legalConfig.retention,
      legalConfig.internationalTransfers,
      legalConfig.audience,
    ].some((value) => !value.trim())
  );
}
