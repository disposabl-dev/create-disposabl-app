import { Stack } from "expo-router";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { useState } from "react";
import { Text, View } from "react-native";
import { api } from "@/lib/convex";
import { authStorage } from "@/lib/auth-storage";
import { styles } from "@/components/auth-ui";

export default function RootLayout() {
  const [client] = useState(() => {
    const url = process.env.EXPO_PUBLIC_CONVEX_URL;
    return url ? new ConvexReactClient(url) : null;
  });

  if (!client) {
    return (
      <View style={[styles.screen, styles.content]}>
        <Text style={styles.title}>Connect your backend</Text>
        <Text style={styles.body}>
          Set EXPO_PUBLIC_CONVEX_URL in apps/mobile/.env.local, then restart the
          development server.
        </Text>
      </View>
    );
  }

  return (
    <ConvexAuthProvider
      client={client}
      api={api.auth}
      storage={authStorage}
      ambientSignIns={[]}
    >
      <Stack screenOptions={{ headerTintColor: "#161b2e" }}>
        <Stack.Screen name="index" options={{ title: "Disposabl" }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack>
    </ConvexAuthProvider>
  );
}
