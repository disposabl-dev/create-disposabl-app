import {
  useSignInWithUsernamePassword,
  useSignUpWithUsernamePassword,
} from "@convex-dev/auth/methods/username-password/react";
import { Link } from "expo-router";
import { useRef, useState } from "react";
import {
  Keyboard,
  Text,
  TextInput,
  View,
  type TextInputInstance,
} from "react-native";
import { api } from "@/lib/convex";
import { authErrorMessage } from "@/lib/auth-errors";
import { AuthButton, AuthScreen, styles } from "./auth-ui";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const { signIn, pending: signingIn } = useSignInWithUsernamePassword(
    api.auth,
  );
  const { signUp, pending: signingUp } = useSignUpWithUsernamePassword(
    api.auth,
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const passwordInput = useRef<TextInputInstance>(null);
  const submitting = useRef(false);
  const pending = signingIn || signingUp;
  const isSignup = mode === "signup";

  async function submit() {
    if (submitting.current || !username || !password) return;
    submitting.current = true;
    setError(null);
    Keyboard.dismiss();
    try {
      const result = await (isSignup ? signUp : signIn)({ username, password });
      if (result.status === "error") {
        setError(authErrorMessage(result.userError));
      } else {
        setPassword("");
        // The auth layout redirects only after Convex confirms authentication.
      }
    } finally {
      submitting.current = false;
    }
  }

  return (
    <AuthScreen>
      <Text style={styles.title}>
        {isSignup ? "Create your account" : "Welcome back"}
      </Text>
      <Text style={styles.body}>
        {isSignup
          ? "Choose a username and password."
          : "Use the same account as the website."}
      </Text>
      <View style={styles.field}>
        <Text style={styles.label}>Username</Text>
        <TextInput
          accessibilityLabel="Username"
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
        disabled={!username || !password}
        onPress={() => void submit()}
      />
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
