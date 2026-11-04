import { privacy } from "./documents/privacy";
import { terms } from "./documents/terms";
import type { LegalDocument } from "./types";

export { legalConfig, legalIsDraft } from "./config";
export const legalDocuments: LegalDocument[] = [
  privacy,
  terms,
  {
    slug: "privacy-request",
    title: "Privacy requests",
    description:
      "Ask to access, correct, export, or delete your personal information.",
    sections: [
      {
        title: "Contact the publisher",
        paragraphs: [
          "Use the privacy contact below and describe your request. Include enough information to locate your account. Do not send passwords, payment card details, or identity documents by email.",
          "The publisher may need to verify your identity before handling a request. This page does not submit or track requests automatically.",
        ],
      },
    ],
  },
  {
    slug: "delete-account",
    title: "Delete your account",
    description:
      "Contact the publisher about deleting your account and associated information.",
    sections: [
      {
        title: "Request account deletion",
        paragraphs: [
          "Use the privacy contact below to request deletion. This page does not delete your account or create a deletion receipt. The publisher must confirm how your request will be handled.",
          "Clearing browser storage or uninstalling an app does not delete information held by the service. Some records may be retained where applicable law requires or permits it; ask the publisher about its retention policy.",
          "Account deletion does not itself cancel an app-store subscription. Manage subscriptions through the store where you purchased them.",
        ],
      },
    ],
  },
];
