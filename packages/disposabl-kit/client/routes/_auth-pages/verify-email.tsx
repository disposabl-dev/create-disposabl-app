import { useCompleteSignUp } from "@convex-dev/auth/methods/email-password/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { api } from "../../../../backend/convex/_generated/api";
import { authErrorMessage } from "../../../lib/auth-errors";
import { getReturnTo } from "../../lib/return-to";
import { PasswordPage } from "../../components/password-page";

function VerifyEmail() {
  const { code } = Route.useSearch();
  const state = useCompleteSignUp(api.authEmail, { emailCode: code });
  useEffect(() => {
    if (state.status !== "complete") return;
    const destination =
      getReturnTo(sessionStorage.getItem("auth-email-return-to")) ??
      "/dashboard";
    sessionStorage.removeItem("auth-email-return-to");
    window.location.replace(destination);
  }, [state.status]);
  return (
    <PasswordPage title="Verify your email">
      {state.status === "loading" ? (
        <p>Checking your link…</p>
      ) : state.status === "complete" ? (
        <p role="status">Email verified. Opening your account…</p>
      ) : (
        <>
          <p role="alert">{authErrorMessage(state.userError)}</p>
          <p>
            If you started in the mobile app, return there and paste this link
            to continue.
          </p>
          <Link to="/signup" className="block underline">
            Start again
          </Link>
        </>
      )}
    </PasswordPage>
  );
}
export const Route = createFileRoute("/_providers/verify-email")({
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === "string" ? search.code : "",
  }),
  component: VerifyEmail,
});
