import type { Publisher } from "./types";

export const publisher: Publisher = {
  operatorName: "Yast Ai, Inc.",
  operatorAddress: "1111B S Governors Ave, Dover, DE 19904-6903",
  country: "United States",
  privacyEmail: "vivek@yast.ai",
  policy: {
    reviewed: true,
    dataNotice:
      "We handle information about purchases, credit balances and compute use to provide billing, reconcile transactions and operate Agent Mode. If you connect a provider, we handle the account and authorization information needed for the connection. If you post a comment in Guides, your comment and display name are public. We store likes, blocks and reports to operate and moderate Guides. In production, optional usage analytics are sent to PostHog only when you opt in; you can change your analytics choice in the app.",
    effectiveDate: "2026-11-16",
    audience:
      "Disposabl is intended for adults aged 18 or older. You must be at least 18 to create an account or use the service.",
    retention:
      "We keep account and project information while your account is active and as needed to provide the service. When you request deletion, we schedule cleanup of your account, associated content, known files, connected credentials and identified managed sandbox. Requests may remain pending when external work or historical records need investigation. Your own GitHub, Convex, Vercel and Expo projects are not deleted. We retain transaction and compute records for reconciliation and applicable obligations, and pseudonymous identity and abuse-prevention fences to prevent reuse and protect the service. These fences currently have no fixed deletion date. Contact us for information about retention and unresolved records.",
    internationalTransfers:
      "We operate in the United States. Our service providers may process or store information in the United States and other countries where they or their subprocessors operate. Contact vivek@yast.ai for information about processing locations and applicable safeguards.",
    aiNotice:
      "To work on your request, Disposabl sends your prompts, selected attachments and project files to Boat's remote sandbox and its Codex AI provider (OpenAI). They may contain personal information. The model and provider configuration depend on the service setup. You can change this permission in Settings. Existing remote work may continue until stopped.",
    deletionInstructions: [
      "In Settings, choose account deletion and confirm the request. Save the receipt reference to check its status on this page after signing out. You can also email vivek@yast.ai to request deletion; include enough information to locate your account, but do not send passwords, payment card details or identity documents.",
      "A request schedules bounded cleanup; it does not mean deletion is complete. External work or historical records may require investigation before completion. We clean up associated content, known files, connected credentials and the identified managed Boat sandbox. Your own GitHub, Convex, Vercel and Expo projects remain in your provider accounts.",
      "We retain transaction and compute records for reconciliation and applicable obligations, and pseudonymous identity and abuse-prevention fences to prevent reuse and protect the service. These fences currently have no fixed deletion date. Contact us about unresolved records and retention.",
      "Uninstalling the app does not delete your account. Account deletion does not itself cancel an app-store subscription; manage subscriptions through the store where you purchased them.",
    ],
  },
  providers: [
    {
      name: "Mux",
      purpose: "Delivery of Guides videos you watch",
    },
    {
      name: "GitHub",
      purpose:
        "Repository access and workflows when you connect a GitHub account",
    },
    {
      name: "Vercel",
      purpose:
        "Connection infrastructure for supported provider account setup when configured",
    },
    {
      name: "Stripe",
      purpose:
        "Payment processing for website purchases when you choose to pay",
    },
    {
      name: "Expo",
      purpose:
        "Mobile app setup, builds, and updates when an Expo account is connected",
    },
    {
      name: "OpenAI",
      purpose:
        "AI processing of submitted prompts and selected project content when you consent to agent use",
    },
    {
      name: "Boat",
      purpose:
        "Remote agent execution for submitted requests and project files when configured",
    },
  ],
};
