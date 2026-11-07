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
          <Link
            to="/forgot-password"
            className="block font-medium text-[#2855c5] underline-offset-4 hover:underline"
          >
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
              className="h-12 rounded-xl border-[#d9dce3] bg-white px-4"
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
              className="h-12 rounded-xl border-[#d9dce3] bg-white px-4"
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
            <p
              role="alert"
              className="rounded-lg bg-destructive/5 p-3 text-destructive"
            >
              {error}
            </p>
          )}
          <Button
            className="h-12 w-full rounded-xl bg-[#161b2e] text-white hover:bg-[#303850]"
            type="submit"
            disabled={state.pending}
          >
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
