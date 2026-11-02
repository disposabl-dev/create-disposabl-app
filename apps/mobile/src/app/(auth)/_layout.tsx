import { useConvexAuth } from "convex/react";
import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { styles } from "@/components/auth-ui";

export default function AuthLayout() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  if (isLoading) {
    return (
      <View style={[styles.screen, styles.content]}>
        <ActivityIndicator />
      </View>
    );
  }
  if (isAuthenticated) return <Redirect href="/" />;
  return (
    <Stack screenOptions={{ headerTintColor: "#161b2e" }}>
      <Stack.Screen name="login" options={{ title: "Log in" }} />
      <Stack.Screen name="signup" options={{ title: "Create account" }} />
    </Stack>
  );
}
