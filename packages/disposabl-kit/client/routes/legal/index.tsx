import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, legalHead } from "../../components/legal-page";

export const Route = createFileRoute("/_providers/legal")({
  head: () => legalHead(),
  component: () => <LegalPage />,
});
