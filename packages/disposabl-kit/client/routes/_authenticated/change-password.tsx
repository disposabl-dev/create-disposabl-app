import { useMutation, useQuery } from "convex/react";
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { api } from "../../../../backend/convex/_generated/api";
import { authErrorMessage } from "../../../lib/auth-errors";
import { PasswordPage } from "../../components/password-page";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Field, FieldLabel } from "../../components/ui/field";

function ChangePassword() {
  const account = useQuery(api.auth.account);
  const providers = useQuery(api.auth.providers);
  const usernameChange = useMutation(api.auth.changePassword);
  const emailChange = useMutation(api.authEmail.changePassword);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [signOutOtherSessions, setSignOutOtherSessions] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const submitting = useRef(false);
  return (
    <PasswordPage title="Change password">
      {account === undefined || !providers ? (
        <p>Loading…</p>
      ) : providers.googleOnly || !account || !account.passwordMethod ? (
        <p>
          This account uses an external sign-in provider. Change your password
          with that provider.
        </p>
      ) : (
        <form
          className="space-y-5"
          onSubmit={async (event) => {
            event.preventDefault();
            if (submitting.current) return;
            setMessage(null);
            if (newPassword !== confirmation) {
              setMessage("New passwords don't match.");
              return;
            }
            submitting.current = true;
            setPending(true);
            try {
              const change =
                account.passwordMethod === "email"
                  ? emailChange
                  : usernameChange;
              const result = await change({
                currentPassword,
                newPassword,
                signOutOtherSessions,
              });
              if (result.success) {
                setCurrentPassword("");
                setNewPassword("");
                setConfirmation("");
                setMessage("Your password has been changed.");
              } else setMessage(authErrorMessage(result.userError));
            } catch {
              setMessage("Couldn't change your password. Please try again.");
            } finally {
              submitting.current = false;
              setPending(false);
            }
          }}
        >
          {(
            [
              [
                "Current password",
                "current-password",
                currentPassword,
                setCurrentPassword,
              ],
              ["New password", "new-password", newPassword, setNewPassword],
              [
                "Confirm new password",
                "confirmation",
                confirmation,
                setConfirmation,
              ],
            ] as const
          ).map(([label, id, value, setValue]) => (
            <Field key={id}>
              <FieldLabel htmlFor={id}>{label}</FieldLabel>
              <Input
                id={id}
                type="password"
                autoComplete={
                  id === "current-password"
                    ? "current-password"
                    : "new-password"
                }
                required
                value={value}
                disabled={pending}
                onChange={(e) => setValue(e.target.value)}
              />
            </Field>
          ))}
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={signOutOtherSessions}
              onChange={(e) => setSignOutOtherSessions(e.target.checked)}
              disabled={pending}
            />
            Log out other devices
          </label>
          {message && <p role="status">{message}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "Changing password…" : "Change password"}
          </Button>
        </form>
      )}
    </PasswordPage>
  );
}
export const Route = createFileRoute(
  "/_providers/_authenticated/change-password",
)({ component: ChangePassword });
