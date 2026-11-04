import { useCompletePasswordRecovery } from "@convex-dev/auth/methods/email-password/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "../../../../backend/convex/_generated/api";
import { authErrorMessage } from "../../../lib/auth-errors";
import { PasswordPage } from "../../components/password-page";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Field, FieldLabel } from "../../components/ui/field";

function ResetPassword() {
  const { code } = Route.useSearch();
  const state = useCompletePasswordRecovery(api.authEmail, { emailCode: code });
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <PasswordPage title="Choose a new password">
      {state.status === "loading" ? (
        <p>Checking your link…</p>
      ) : state.status === "complete" ? (
        <>
          <p role="status">
            Your password has been reset. Other sessions have been logged out.
          </p>
          <a href="/dashboard" className="underline">
            Continue to your account
          </a>
        </>
      ) : state.status === "error" ? (
        <>
          <p role="alert">{authErrorMessage(state.userError)}</p>
          <Link to="/forgot-password" className="block underline">
            Request another reset link
          </Link>
          {code && (
            <p>
              If you started in the mobile app, return there and paste this link
              to continue.
            </p>
          )}
        </>
      ) : (
        <form
          className="space-y-5"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            if (password !== confirmation) {
              setError("Passwords don't match.");
              return;
            }
            const result = await state.completePasswordRecovery({
              newPassword: password,
            });
            if (result.status === "error")
              setError(authErrorMessage(result.userError));
            else {
              setPassword("");
              setConfirmation("");
            }
          }}
        >
          <Field>
            <FieldLabel htmlFor="new-password">New password</FieldLabel>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              disabled={state.pending}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="confirmation">Confirm new password</FieldLabel>
            <Input
              id="confirmation"
              type="password"
              autoComplete="new-password"
              required
              disabled={state.pending}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </Field>
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={state.pending}>
            {state.pending ? "Resetting…" : "Reset password"}
          </Button>
        </form>
      )}
    </PasswordPage>
  );
}
export const Route = createFileRoute("/_providers/reset-password")({
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === "string" ? search.code : "",
  }),
  component: ResetPassword,
});
