import { authReturnPath } from "../lib/auth-return";
import { useCompleteSignUp } from "@convex-dev/auth/methods/email-password/react";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Text, TextInput } from "react-native";
import { api } from "../lib/convex";
import { authErrorMessage } from "../../lib/auth-errors";
import { AuthButton, useAuthStyles } from "./auth-ui";

export function emailLinkCode(link: string): string {
  try {
    return new URL(link.trim()).searchParams.get("code") ?? "";
  } catch {
    return link.trim();
  }
}

export function EmailLinkInput({
  onContinue,
}: {
  onContinue: (code: string) => void;
}) {
  const styles = useAuthStyles();
  const [link, setLink] = useState("");
  return (
    <>
      <Text style={styles.body}>
        Copy the link from your email and paste it here. Finish in this app on
        the same device.
      </Text>
      <TextInput
        accessibilityLabel="Email verification link"
        placeholder="Paste email link"
        style={styles.input}
        value={link}
        onChangeText={setLink}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <AuthButton
        title="Continue"
        disabled={!emailLinkCode(link)}
        onPress={() => onContinue(emailLinkCode(link))}
      />
    </>
  );
}

export function EmailVerification() {
  const [code, setCode] = useState("");
  return code ? (
    <CompleteVerification code={code} />
  ) : (
    <EmailLinkInput onContinue={setCode} />
  );
}

function CompleteVerification({ code }: { code: string }) {
  const styles = useAuthStyles();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const state = useCompleteSignUp(api.authEmail, { emailCode: code });
  useEffect(() => {
    if (state.status === "complete") router.replace(authReturnPath(returnTo));
  }, [state.status, returnTo]);
  return (
    <Text
      accessibilityRole={state.status === "error" ? "alert" : undefined}
      style={state.status === "error" ? styles.error : styles.body}
    >
      {state.status === "error"
        ? authErrorMessage(state.userError)
        : state.status === "complete"
          ? "Email verified."
          : "Verifying email…"}
    </Text>
  );
}
