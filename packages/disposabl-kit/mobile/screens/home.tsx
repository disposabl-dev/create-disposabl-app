import { useConvexAuth } from "convex/react";
import { router, Stack } from "expo-router";
import { Image, Text } from "react-native";
import { AuthButton, AuthScreen, styles } from "../components/auth-ui";

export function HomeScreen() {
  return (
    <AuthScreen>
      <HomeIntro />
      <AccountLinks />
    </AuthScreen>
  );
}

function AccountLinks() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (isLoading)
    return <Text style={styles.body}>Restoring your session...</Text>;
  if (isAuthenticated) {
    return (
      <AuthButton
        title="Your account"
        onPress={() => router.push("/(authenticated)/account")}
      />
    );
  }
  return (
    <>
      <Text style={styles.body}>
        Log in to see your account, or create one to get started.
      </Text>
      <AuthButton title="Log in" onPress={() => router.push("/(auth)/login")} />
      <AuthButton
        title="Create account"
        onPress={() => router.push("/(auth)/signup")}
      />
    </>
  );
}

export function PublicHomeScreen() {
  return (
    <AuthScreen>
      <Stack.Screen options={{ title: "Disposabl" }} />
      <HomeIntro />
    </AuthScreen>
  );
}

function HomeIntro() {
  return (
    <>
      <Image
        source={require("../lib/logo.png")}
        style={{ width: 96, height: 96 }}
        accessibilityLabel="Disposabl logo"
      />
      <Text style={styles.title}>Welcome to Disposabl</Text>
      <Text style={styles.body}>
        Your app starts here. Make this space your own and build something
        useful.
      </Text>
    </>
  );
}
