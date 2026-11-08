import { authReturnPath } from "../lib/auth-return";
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
import { Link, router, useLocalSearchParams } from "expo-router";
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
import { AuthButton, AuthScreen, authClasses } from "./auth-ui";
import { GoogleSignIn } from "./google-sign-in";
import { BrandMark } from "../design/brand-mark";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { signIn, pending: signingIn } = useSignInWithUsernamePassword(
    api.auth,
  );
  const { signUp, pending: signingUp } = useSignUpWithUsernamePassword(
    api.auth,
  );
  const providers = useQuery(api.auth.providers);
  const emailIn = useSignInWithEmailPassword(api.authEmail);
  const emailUp = useSignUpWithEmailPassword(api.authEmail);
  const [sent, setSent] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const email = Boolean(providers?.emailPassword);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const passwordInput = useRef<TextInputInstance>(null);
  const confirmationInput = useRef<TextInputInstance>(null);
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
        router.replace(authReturnPath(returnTo));
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
        <Text className={authClasses.title}>Check your email</Text>
        <EmailVerification />
      </AuthScreen>
    );

  return (
    <AuthScreen>
      <BrandMark />
      <Text className={authClasses.title}>
        {isSignup ? "Create your account" : "Welcome back"}
      </Text>
      <Text className={authClasses.body}>
        {providers?.googleOnly
          ? "Continue with your Google account."
          : isSignup
            ? email
              ? "Choose an email and password."
              : "Choose a username and password."
            : "Use the same account as the website."}
      </Text>
      {providers?.google && <GoogleSignIn disabled={pending} />}
      {providers?.googleOnly && !providers.google && (
        <Text className={authClasses.error}>
          Sign-in is temporarily unavailable. Please try again later.
        </Text>
      )}
      {!providers?.googleOnly && (
        <>
          <View className={authClasses.field}>
            <Text className={authClasses.label}>
              {email ? "Email" : "Username"}
            </Text>
            <TextInput
              accessibilityLabel={email ? "Email" : "Username"}
              keyboardType={email ? "email-address" : "default"}
              className={authClasses.input}
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
          <View className={authClasses.field}>
            <Text className={authClasses.label}>Password</Text>
            <TextInput
              ref={passwordInput}
              accessibilityLabel="Password"
              className={authClasses.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={isSignup ? "new-password" : "current-password"}
              textContentType={isSignup ? "newPassword" : "password"}
              editable={!pending}
              returnKeyType={isSignup ? "next" : "go"}
              onSubmitEditing={() => {
                if (isSignup) confirmationInput.current?.focus();
                else void submit();
              }}
            />
          </View>
          {isSignup && (
            <View className={authClasses.field}>
              <Text className={authClasses.label}>Confirm password</Text>
              <TextInput
                ref={confirmationInput}
                accessibilityLabel="Confirm password"
                className={authClasses.input}
                value={confirmation}
                onChangeText={setConfirmation}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                editable={!pending}
                returnKeyType="go"
                onSubmitEditing={() => void submit()}
              />
            </View>
          )}
          {email && isSignup && providers && !providers.emailDelivery && (
            <Text className={authClasses.error}>
              Email signup is temporarily unavailable.
            </Text>
          )}
          {error && (
            <Text accessibilityRole="alert" className={authClasses.error}>
              {error}
            </Text>
          )}
          <AuthButton
            title={
              pending
                ? "Please wait..."
                : isSignup
                  ? "Create account"
                  : "Log in"
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
            <Link href="/(auth)/forgot-password" className={authClasses.link}>
              Forgot password?
            </Link>
          )}
          {providers && (
            <Link
              replace
              href={{
                pathname: isSignup ? "/(auth)/login" : "/(auth)/signup",
                params: { returnTo },
              }}
              className={authClasses.link}
            >
              {isSignup
                ? "Already have an account? Log in"
                : "New here? Create an account"}
            </Link>
          )}
        </>
      )}
    </AuthScreen>
  );
}
