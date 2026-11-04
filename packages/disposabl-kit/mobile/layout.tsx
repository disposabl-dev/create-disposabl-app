import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexProvider, ConvexReactClient, useConvexAuth } from "convex/react";
import { Redirect, Stack, usePathname } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { authenticationEnabled } from "../features";
import { styles } from "./components/auth-ui";
import { authStorage } from "./lib/auth-storage";
import { api } from "./lib/convex";

export function MobileLayout() {
  useScreenTelemetry();
  const [client] = useState(() => {
    const url = process.env.EXPO_PUBLIC_CONVEX_URL;
    return url ? new ConvexReactClient(url) : null;
  });

  if (!client) {
    return (
      <View style={[styles.screen, styles.content]}>
        <Text style={styles.title}>Connect your backend</Text>
        <Text style={styles.body}>
          Set EXPO_PUBLIC_CONVEX_URL in apps/mobile/.env.local, then rebuild the
          app.
        </Text>
      </View>
    );
  }

  if (!authenticationEnabled) {
    return (
      <ConvexProvider client={client}>
        <PublicLayout />
      </ConvexProvider>
    );
  }

  return (
    <ConvexAuthProvider
      client={client}
      api={api.auth}
      storage={authStorage}
      ambientSignIns={[]}
    >
      <SessionRoutes />
    </ConvexAuthProvider>
  );
}

function SessionRoutes() {
  const { isAuthenticated } = useConvexAuth();
  return <Routes isAuthenticated={isAuthenticated} />;
}

function Routes({ isAuthenticated = false }: { isAuthenticated?: boolean }) {
  return (
    <Stack screenOptions={{ headerTintColor: "#161b2e" }}>
      <Stack.Screen name="index" options={{ title: "Disposabl" }} />
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Screen name="(authenticated)" options={{ headerShown: false }} />
    </Stack>
  );
}

export function AuthLayout() {
  return (
    <Stack screenOptions={{ headerTintColor: "#161b2e" }}>
      <Stack.Screen name="login" options={{ title: "Log in" }} />
      <Stack.Screen name="signup" options={{ title: "Create account" }} />
      <Stack.Screen
        name="forgot-password"
        options={{ title: "Reset password" }}
      />
    </Stack>
  );
}

// The route-group layout is the boundary: every descendant inherits this check.
// Public sibling routes need no guard and no separate route registry.
export function AuthenticatedLayout() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  if (isLoading) {
    return (
      <View style={[styles.screen, styles.content]}>
        <ActivityIndicator accessibilityLabel="Loading session" />
      </View>
    );
  }
  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;
  return <AccountRoutes />;
}

function AccountRoutes() {
  return (
    <Stack screenOptions={{ headerTintColor: "#161b2e" }}>
      <Stack.Screen name="account" options={{ title: "Account" }} />
      <Stack.Screen
        name="change-password"
        options={{ title: "Change password" }}
      />
    </Stack>
  );
}

/** A route group without a session requirement. */
export function PublicLayout() {
  return <Stack screenOptions={{ headerTintColor: "#161b2e" }} />;
}

function useScreenTelemetry() {
  const pathname = usePathname();
  useEffect(() => {
    if (
      __DEV__ ||
      process.env.EXPO_PUBLIC_DISPOSABL_ANALYTICS_ENABLED !== "true" ||
      !process.env.EXPO_PUBLIC_CONVEX_SITE_URL
    )
      return;
    const page =
      pathname === "/"
        ? "home"
        : pathname === "/login"
          ? "login"
          : pathname === "/signup"
            ? "signup"
            : pathname === "/account"
              ? "account"
              : "other";
    void fetch(`${process.env.EXPO_PUBLIC_CONVEX_SITE_URL}/telemetry/page`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ platform: "mobile", page }),
    }).catch(() => {});
  }, [pathname]);
}
