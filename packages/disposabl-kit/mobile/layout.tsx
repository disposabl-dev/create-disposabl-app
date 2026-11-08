import { ConvexAuthProvider, useAuthToken } from "@convex-dev/auth/react";
import { ConvexProvider, ConvexReactClient, useConvexAuth } from "convex/react";
import { Redirect, Stack, router, usePathname } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { analyticsEnabled, authenticationEnabled } from "../features";
import { authClasses } from "./components/auth-ui";
import { authStorage } from "./lib/auth-storage";
import { api } from "./lib/convex";
import { sendPageTelemetry } from "../lib/telemetry";
import { sessionId } from "../lib/auth-session";
import { UpdatePrompt } from "./updates/update-prompt";
import { ThemeProvider, useResolvedColorScheme } from "./design/theme-provider";
import { useTheme } from "./design/use-theme";

export function MobileLayout({ children }: { children?: ReactNode }) {
  return (
    <ThemeProvider>
      <BackendLayout>{children}</BackendLayout>
    </ThemeProvider>
  );
}

function BackendLayout({ children }: { children?: ReactNode }) {
  const [client] = useState(() => {
    const url = process.env.EXPO_PUBLIC_CONVEX_URL;
    return url ? new ConvexReactClient(url) : null;
  });

  if (!client) {
    return (
      <View className={`${authClasses.screen} ${authClasses.content}`}>
        <Text className={authClasses.title}>Connect your backend</Text>
        <Text className={authClasses.body}>
          Set EXPO_PUBLIC_CONVEX_URL in apps/mobile/.env.local, then rebuild the
          app.
        </Text>
      </View>
    );
  }

  if (!authenticationEnabled) {
    return (
      <ConvexProvider client={client}>
        <ScreenTelemetry token={null} />
        <UpdatePrompt>{children ?? <PublicLayout />}</UpdatePrompt>
      </ConvexProvider>
    );
  }

  return (
    <ConvexAuthProvider client={client} api={api.auth} storage={authStorage}>
      <AuthenticatedScreenTelemetry />
      <UpdatePrompt>{children ?? <SessionRoutes />}</UpdatePrompt>
    </ConvexAuthProvider>
  );
}

function SessionRoutes() {
  const { isAuthenticated } = useConvexAuth();
  return <Routes isAuthenticated={isAuthenticated} />;
}

function Routes({ isAuthenticated = false }: { isAuthenticated?: boolean }) {
  const colors = useTheme();
  const dark = useResolvedColorScheme() === "dark";
  return (
    <Stack
      screenOptions={{
        statusBarStyle: dark ? "light" : "dark",
        headerTintColor: colors.foreground,
        headerStyle: { backgroundColor: colors.background },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="settings"
        options={{ title: "Settings", presentation: "fullScreenModal" }}
      />
      <Stack.Screen name="index" options={{ title: "Disposabl" }} />
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen
          name="(auth)"
          options={{ headerShown: false, presentation: "modal" }}
        />
      </Stack.Protected>
      <Stack.Screen name="(authenticated)" options={{ headerShown: false }} />
    </Stack>
  );
}

export function AuthLayout() {
  const colors = useTheme();
  const dark = useResolvedColorScheme() === "dark";
  if (!authenticationEnabled) return <Redirect href="/" />;
  return (
    <Stack
      screenOptions={{
        statusBarStyle: dark ? "light" : "dark",
        headerTintColor: colors.foreground,
        headerStyle: { backgroundColor: colors.background },
        contentStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: "minimal",
      }}
    >
      <Stack.Screen
        name="login"
        options={{ title: "", headerLeft: CloseAuth }}
      />
      <Stack.Screen
        name="signup"
        options={{ title: "", headerLeft: CloseAuth }}
      />
      <Stack.Screen
        name="forgot-password"
        options={{ title: "Reset password" }}
      />
    </Stack>
  );
}

function CloseAuth() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Close sign in"
      onPress={() => router.dismissTo("/")}
      className="p-[10px]"
    >
      <Text className="text-foreground text-[18px]">✕</Text>
    </Pressable>
  );
}

// The route-group layout is the boundary: every descendant inherits this check.
// Public sibling routes need no guard and no separate route registry.
export function AuthenticatedLayout() {
  return authenticationEnabled ? <SessionLayout /> : <AccountRoutes />;
}

function SessionLayout() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  if (isLoading) {
    return (
      <View className={`${authClasses.screen} ${authClasses.content}`}>
        <ActivityIndicator accessibilityLabel="Loading session" />
      </View>
    );
  }
  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;
  return <AccountRoutes />;
}

function AccountRoutes() {
  const colors = useTheme();
  const dark = useResolvedColorScheme() === "dark";
  return (
    <Stack
      screenOptions={{
        statusBarStyle: dark ? "light" : "dark",
        headerTintColor: colors.foreground,
        headerStyle: { backgroundColor: colors.background },
        contentStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: "minimal",
      }}
    >
      <Stack.Protected guard={authenticationEnabled}>
        <Stack.Screen
          name="change-password"
          options={{ title: "Change password" }}
        />
      </Stack.Protected>
    </Stack>
  );
}

/** A route group without a session requirement. */
export function PublicLayout() {
  const colors = useTheme();
  const dark = useResolvedColorScheme() === "dark";
  return (
    <Stack
      screenOptions={{
        statusBarStyle: dark ? "light" : "dark",
        headerTintColor: colors.foreground,
        headerStyle: { backgroundColor: colors.background },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="settings"
        options={{ title: "Settings", presentation: "fullScreenModal" }}
      />
      <Stack.Protected guard={false}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(authenticated)" />
      </Stack.Protected>
    </Stack>
  );
}

function AuthenticatedScreenTelemetry() {
  const token = useAuthToken();
  const { isLoading, isAuthenticated } = useConvexAuth();
  return (
    <ScreenTelemetry
      token={token}
      ready={!isLoading && (!isAuthenticated || !!token)}
    />
  );
}
function ScreenTelemetry({
  token,
  ready = true,
}: {
  token: string | null;
  ready?: boolean;
}) {
  const lastView = useRef<string | null>(null);
  const pathname = usePathname();
  useEffect(() => {
    const origin = process.env.EXPO_PUBLIC_CONVEX_SITE_URL;
    if (
      !ready ||
      !analyticsEnabled ||
      __DEV__ ||
      process.env.EXPO_PUBLIC_DISPOSABL_ANALYTICS_ENABLED !== "true" ||
      !origin
    )
      return;
    const key = JSON.stringify([pathname, sessionId(token)]);
    if (lastView.current === key) return;
    lastView.current = key;
    void sendPageTelemetry(origin, "mobile", pathname, token);
  }, [pathname, token, ready]);
  return null;
}
