import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, legalHead } from "../../components/legal-page";

export const Route = createFileRoute("/_providers/legal/terms")({
  head: () => legalHead("terms"),
  component: () => <LegalPage slug="terms" />,
});
