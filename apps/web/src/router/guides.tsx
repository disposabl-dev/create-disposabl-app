import { createFileRoute } from "@tanstack/react-router";
import { GuideLibrary } from "../components/landing/guide-library";

export const Route = createFileRoute("/_providers/guides")({
  head: () => ({
    meta: [
      { title: "Guides | Disposabl" },
      {
        name: "description",
        content:
          "Short guides to starting, publishing, and running your app with Disposabl.",
      },
    ],
  }),
  component: GuideLibrary,
});
