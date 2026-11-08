import { createFileRoute } from "@tanstack/react-router";
import { GuidePage } from "../components/landing/guides";
import { marketingHead } from "../components/landing/metadata";

export const Route = createFileRoute("/_providers/build")({
  head: () => marketingHead("/build"),
  component: () => <GuidePage kind="build" />,
});
