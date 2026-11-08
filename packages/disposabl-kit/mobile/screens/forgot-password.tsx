import {
  useCompletePasswordRecovery,
  useStartPasswordRecovery,
} from "@convex-dev/auth/methods/email-password/react";
import { useQuery } from "convex/react";
import { Link } from "expo-router";
import { useState } from "react";
import { Text, TextInput } from "react-native";
import { api } from "../lib/convex";
import { authErrorMessage } from "../../lib/auth-errors";
import { AuthButton, AuthScreen, authClasses } from "../components/auth-ui";
import { EmailLinkInput } from "../components/email-verification";

export function ForgotPasswordScreen() {
  const providers = useQuery(api.auth.providers);
  const { startPasswordRecovery, pending } = useStartPasswordRecovery(
    api.authEmail,
  );
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <AuthScreen>
      <Text className={authClasses.title}>Reset password</Text>
      {!providers ? (
        <Text className={authClasses.body}>Loading…</Text>
      ) : !providers.emailDelivery ? (
        <Text className={authClasses.body}>
          Email recovery is not available. Username-only accounts need help from
          the app owner.
        </Text>
      ) : code ? (
        <ResetPassword code={code} />
      ) : sent ? (
        <>
          <Text className={authClasses.body}>
            If this email belongs to an account, a reset link will arrive
            shortly. It expires in 10 minutes.
          </Text>
          <EmailLinkInput onContinue={setCode} />
        </>
      ) : (
        <>
          <Text className={authClasses.body}>
            Enter the verified email for your account.
          </Text>
          <TextInput
            accessibilityLabel="Email"
            className={authClasses.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            editable={!pending}
          />
          {error && (
            <Text accessibilityRole="alert" className={authClasses.error}>
              {error}
            </Text>
          )}
          <AuthButton
            title="Send reset link"
            pending={pending}
            disabled={!email}
            onPress={async () => {
              setError(null);
              const result = await startPasswordRecovery({ email });
              if (
                result.success ||
                result.userError.error === "EMAIL_NOT_FOUND"
              )
                setSent(true);
              else setError(authErrorMessage(result.userError));
            }}
          />
        </>
      )}
      <Link href="/(auth)/login" className={authClasses.link}>
        Back to login
      </Link>
    </AuthScreen>
  );
}

function ResetPassword({ code }: { code: string }) {
  const state = useCompletePasswordRecovery(api.authEmail, { emailCode: code });
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (state.status !== "ready")
    return (
      <Text
        className={
          state.status === "error" ? authClasses.error : authClasses.body
        }
      >
        {state.status === "error"
          ? authErrorMessage(state.userError)
          : state.status === "complete"
            ? "Password reset. You are logged in."
            : "Checking your link…"}
      </Text>
    );
  return (
    <>
      <TextInput
        accessibilityLabel="New password"
        placeholder="New password"
        className={authClasses.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        editable={!state.pending}
      />
      <TextInput
        accessibilityLabel="Confirm new password"
        placeholder="Confirm new password"
        className={authClasses.input}
        value={confirmation}
        onChangeText={setConfirmation}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        editable={!state.pending}
      />
      {error && (
        <Text accessibilityRole="alert" className={authClasses.error}>
          {error}
        </Text>
      )}
      <AuthButton
        title="Reset password"
        pending={state.pending}
        disabled={!password || !confirmation}
        onPress={async () => {
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
      />
    </>
  );
}
