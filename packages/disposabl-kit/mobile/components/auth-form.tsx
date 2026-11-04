import {
  useSignInWithUsernamePassword,
  useSignUpWithUsernamePassword,
} from "@convex-dev/auth/methods/username-password/react";
import {
  useSignInWithEmailPassword,
  useSignUpWithEmailPassword,
} from "@convex-dev/auth/methods/email-password/react";
import { useQuery } from "convex/react";
import { EmailVerification } from "./email-verification";
import { Link, router } from "expo-router";
import { useRef, useState } from "react";
import {
  Keyboard,
  Text,
  TextInput,
  View,
  type TextInputInstance,
} from "react-native";
import { api } from "../lib/convex";
import { authErrorMessage } from "../../lib/auth-errors";
import { AuthButton, AuthScreen, styles } from "./auth-ui";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const { signIn, pending: signingIn } = useSignInWithUsernamePassword(
    api.auth,
  );
  const { signUp, pending: signingUp } = useSignUpWithUsernamePassword(
    api.auth,
  );
  const providers = useQuery(api.auth.providers);
  const emailIn = useSignInWithEmailPassword(api.authEmail);
  const emailUp = useSignUpWithEmailPassword(api.authEmail);
  const [legacy, setLegacy] = useState(false);
  const [sent, setSent] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const email = Boolean(
    providers &&
    (mode === "signup"
      ? providers.emailPassword
      : providers.emailPassword !== legacy),
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const passwordInput = useRef<TextInputInstance>(null);
  const submitting = useRef(false);
  const pending = signingIn || signingUp || emailIn.pending || emailUp.pending;
  const isSignup = mode === "signup";

  async function submit() {
    if (submitting.current || !username || !password) return;
    if (isSignup && password !== confirmation) {
      setError("Passwords don't match.");
      return;
    }
    submitting.current = true;
    setError(null);
    Keyboard.dismiss();
    try {
      if (email && isSignup) {
        const result = await emailUp.signUp({ email: username, password });
        if (result.success) {
          setPassword("");
          setConfirmation("");
          setSent(true);
        } else setError(authErrorMessage(result.userError));
        return;
      }
      const result = email
        ? await emailIn.signIn({ email: username, password })
        : await (isSignup ? signUp : signIn)({ username, password });
      if (result.status === "error") {
        setError(authErrorMessage(result.userError));
      } else {
        setPassword("");
        router.replace("/(authenticated)/account");
      }
    } catch {
      setError("Couldn't connect. Please try again.");
    } finally {
      submitting.current = false;
    }
  }

  if (sent)
    return (
      <AuthScreen>
        <Text style={styles.title}>Check your email</Text>
        <EmailVerification />
      </AuthScreen>
    );

  return (
    <AuthScreen>
      <Text style={styles.title}>
        {isSignup ? "Create your account" : "Welcome back"}
      </Text>
      <Text style={styles.body}>
        {isSignup
          ? email
            ? "Choose an email and password."
            : "Choose a username and password."
          : "Use the same account as the website."}
      </Text>
      <View style={styles.field}>
        <Text style={styles.label}>{email ? "Email" : "Username"}</Text>
        <TextInput
          accessibilityLabel={email ? "Email" : "Username"}
          keyboardType={email ? "email-address" : "default"}
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={isSignup ? "username-new" : "username"}
          textContentType="username"
          editable={!pending}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordInput.current?.focus()}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Password</Text>
        <TextInput
          ref={passwordInput}
          accessibilityLabel="Password"
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={isSignup ? "new-password" : "current-password"}
          textContentType={isSignup ? "newPassword" : "password"}
          editable={!pending}
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
        />
      </View>
      {isSignup && (
        <View style={styles.field}>
          <Text style={styles.label}>Confirm password</Text>
          <TextInput
            accessibilityLabel="Confirm password"
            style={styles.input}
            value={confirmation}
            onChangeText={setConfirmation}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            editable={!pending}
          />
        </View>
      )}
      {email && isSignup && providers && !providers.emailDelivery && (
        <Text style={styles.error}>
          Email signup is temporarily unavailable.
        </Text>
      )}
      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      <AuthButton
        title={
          pending ? "Please wait..." : isSignup ? "Create account" : "Log in"
        }
        pending={pending}
        disabled={
          !providers ||
          !username ||
          !password ||
          (isSignup && email && !providers.emailDelivery)
        }
        onPress={() => void submit()}
      />
      {providers?.emailDelivery && (
        <Link href="/(auth)/forgot-password" style={styles.link}>
          Forgot password?
        </Link>
      )}
      {!isSignup && providers && (
        <Text
          accessibilityRole="button"
          style={styles.link}
          onPress={() => {
            setLegacy(!legacy);
            setUsername("");
          }}
        >
          {email ? "Use an existing username" : "Use an existing email"}
        </Text>
      )}
      {!pending && (
        <Link
          replace
          href={isSignup ? "/(auth)/login" : "/(auth)/signup"}
          style={styles.link}
        >
          {isSignup
            ? "Already have an account? Log in"
            : "New here? Create an account"}
        </Link>
      )}
      <Link href="/" style={styles.link}>
        Back to home
      </Link>
    </AuthScreen>
  );
}
