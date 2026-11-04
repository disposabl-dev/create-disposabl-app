import { createFileRoute } from "@tanstack/react-router";
import { PasswordAuthForm } from "../../components/password-auth-form";
import { getReturnTo } from "../../lib/return-to";

export const Route = createFileRoute("/_providers/login")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { request?: string; returnTo?: string } => ({
    request:
      typeof search.request === "string"
        ? search.request.trim() || undefined
        : undefined,
    returnTo: getReturnTo(search.returnTo),
  }),
  component: () => <PasswordAuthForm {...Route.useSearch()} mode="login" />,
});
