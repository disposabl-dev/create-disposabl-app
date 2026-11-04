import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, legalHead } from "../../components/legal-page";

export const Route = createFileRoute("/_providers/legal/delete-account")({
  head: () => legalHead("delete-account"),
  component: () => <LegalPage slug="delete-account" />,
});
