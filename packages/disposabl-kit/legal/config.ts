import project from "../../../package.json";
import {
  authenticationEnabled,
  analyticsEnabled,
  paymentsEnabled,
} from "../features";
import config from "../../../disposabl.json";
import { publisher } from "./publisher";

// Public draft details. Each app publisher must review these before launch.
export const legalConfig = {
  appName: project.name === "disposabl-dev" ? "Disposabl" : project.name,
  operatorName: publisher.operatorName,
  operatorAddress: publisher.operatorAddress,
  country: publisher.country,
  privacyEmail: publisher.privacyEmail,
  effectiveDate: publisher.policy?.effectiveDate ?? "",
  reviewed: publisher.policy?.reviewed ?? false,
  dataNotice: publisher.policy?.dataNotice ?? "",
  retention: publisher.policy?.retention ?? "",
  internationalTransfers: publisher.policy?.internationalTransfers ?? "",
  audience: publisher.policy?.audience ?? "",
  aiNotice: publisher.policy?.aiNotice ?? "",
  deletionInstructions: publisher.policy?.deletionInstructions,
  providers: [
    {
      name: "Convex",
      purpose: authenticationEnabled
        ? "Application database, hosting, and account authentication"
        : "Application database and hosting",
    },
    ...publisher.providers,
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
    ...(paymentsEnabled
      ? [
          {
            name: "Autumn",
            purpose: "Billing and credit balances when payments are configured",
          },
          ...(config.platforms.some(
            (platform) => platform === "android" || platform === "ios",
          )
            ? [
                {
                  name: "RevenueCat",
                  purpose:
                    "Mobile purchase and subscription information when payments are configured",
                },
              ]
            : []),
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
