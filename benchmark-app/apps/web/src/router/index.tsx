import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_providers/")({
  head: () => ({
    meta: [
      { title: "Disposabl | Build your app" },
      {
        name: "description",
        content:
          "Create apps for web, mobile, desktop, and developer tools. Draft, preview, publish.",
      },
    ],
  }),
  component: () => <div>Hello World from the index route</div>,
});
