import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { Link, router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { authenticationEnabled } from "../../features";
import { AuthButton, AuthScreen, styles } from "../components/auth-ui";
import { api } from "../lib/convex";

export function AccountScreen() {
  if (!authenticationEnabled) {
    return (
      <AuthScreen>
        <Text style={styles.title}>Account</Text>
        <Text style={styles.body}>
          Authentication is disabled. This screen is publicly accessible.
        </Text>
        <Link href="/" style={styles.link}>
          Back to home
        </Link>
      </AuthScreen>
    );
  }
  return <SignedInAccount />;
}

function SignedInAccount() {
  const user = useQuery(api.users.current);
  const { signOut } = useAuthActions();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logOut() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await signOut();
      router.replace("/");
    } catch {
      setError("Couldn't clear your session. Please try logging out again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthScreen>
      <Text style={styles.title}>
        {user?.username ? `Hi, ${user.username}` : "Your account"}
      </Text>
      {user === undefined ? (
        <Text style={styles.body}>Loading your account...</Text>
      ) : user === null ? (
        <Text style={styles.error}>Your account could not be found.</Text>
      ) : (
        <View style={styles.card}>
          <Text style={styles.label}>You are logged in</Text>
          <Text style={styles.body}>
            Username: {user.username ?? "Not set"}
          </Text>
          <Text style={styles.body} selectable>
            User ID: {user.id}
          </Text>
          <Text style={styles.body}>
            Your account was verified by the server.
          </Text>
        </View>
      )}
      <AuthButton
        title={pending ? "Logging out..." : "Log out"}
        pending={pending}
        onPress={() => void logOut()}
      />
      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      <Link href="/" style={styles.link}>
        Back to home
      </Link>
    </AuthScreen>
  );
}
