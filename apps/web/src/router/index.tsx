import { createFileRoute } from "@tanstack/react-router";
import { Home } from "../components/landing/home";

export const Route = createFileRoute("/_providers/")({
  component: Home,
});
