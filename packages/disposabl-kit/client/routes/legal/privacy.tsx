import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, legalHead } from "../../components/legal-page";

export const Route = createFileRoute("/_providers/legal/privacy")({
  head: () => legalHead("privacy"),
  component: () => <LegalPage slug="privacy" />,
});
