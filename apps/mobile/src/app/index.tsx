import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { AuthButton, AuthScreen, styles } from "@/components/auth-ui";
import { api } from "@/lib/convex";

export default function Index() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.current, isAuthenticated ? {} : "skip");
  const { signOut } = useAuthActions();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logOut() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await signOut();
    } catch {
      setError("Couldn't clear your session. Please try logging out again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthScreen>
      {isLoading ? (
        <>
          <ActivityIndicator accessibilityLabel="Loading session" />
          <Text style={styles.body}>Restoring your session...</Text>
        </>
      ) : isAuthenticated ? (
        <>
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
        </>
      ) : (
        <>
          <Text style={styles.title}>Welcome to Disposabl</Text>
          <Text style={styles.body}>
            Log in to see your account, or create one to get started.
          </Text>
          <AuthButton
            title="Log in"
            onPress={() => router.push("/(auth)/login")}
          />
          <AuthButton
            title="Create account"
            onPress={() => router.push("/(auth)/signup")}
          />
        </>
      )}
      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
    </AuthScreen>
  );
}
