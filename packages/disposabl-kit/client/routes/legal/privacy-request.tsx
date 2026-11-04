import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, legalHead } from "../../components/legal-page";

export const Route = createFileRoute("/_providers/legal/privacy-request")({
  head: () => legalHead("privacy-request"),
  component: () => <LegalPage slug="privacy-request" />,
});
