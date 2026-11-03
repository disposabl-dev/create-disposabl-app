import { createFileRoute } from "@tanstack/react-router";
import { Home } from "../components/landing/home";

export const Route = createFileRoute("/_providers/")({
  head: () => ({
    meta: [
      { title: "Disposabl | Your app, on every platform" },
      {
        name: "description",
        content:
          "Create your app for web, mobile, and desktop with Disposabl. Copy a prompt into your coding agent or start with one command. Open source.",
      },
    ],
  }),
  component: Home,
});
