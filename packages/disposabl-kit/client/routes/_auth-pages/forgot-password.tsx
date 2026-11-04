import { useStartPasswordRecovery } from "@convex-dev/auth/methods/email-password/react";
import { useQuery } from "convex/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "../../../../backend/convex/_generated/api";
import { authErrorMessage } from "../../../lib/auth-errors";
import { PasswordPage } from "../../components/password-page";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Field, FieldLabel } from "../../components/ui/field";

function ForgotPassword() {
  const providers = useQuery(api.auth.providers);
  const { startPasswordRecovery, pending } = useStartPasswordRecovery(
    api.authEmail,
  );
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <PasswordPage title="Reset your password">
      {!providers ? (
        <p>Loading…</p>
      ) : !providers.emailDelivery ? (
        <p>
          Email recovery is not available for this app. If you have a username
          account, contact the app owner for help. Signed-in users can change
          their password in account settings.
        </p>
      ) : sent ? (
        <p role="status">
          If this email belongs to an account, a reset link will arrive shortly.
          Open it in this browser within 10 minutes.
        </p>
      ) : (
        <form
          className="space-y-5"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            const result = await startPasswordRecovery({ email });
            if (result.success || result.userError.error === "EMAIL_NOT_FOUND")
              setSent(true);
            else setError(authErrorMessage(result.userError));
          }}
        >
          <p>
            Enter your verified email to receive a password reset link.
            Username-only accounts do not have email recovery.
          </p>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={pending}
            />
          </Field>
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
      <Link to="/login" className="block underline">
        Back to login
      </Link>
    </PasswordPage>
  );
}
export const Route = createFileRoute("/_providers/forgot-password")({
  component: ForgotPassword,
});
