import { ConnectionProvider } from "./connections";
import { useConvexAuth } from "convex/react";
import { Stack } from "expo-router";
import { NativeTabs } from "expo-router/native-tabs";
import { authenticationEnabled } from "@disposabl/disposabl-kit/features";
import { useTheme } from "../../../../../packages/disposabl-kit/mobile/design/use-theme";
import {
  useAccentColor,
  useResolvedColorScheme,
} from "../../../../../packages/disposabl-kit/mobile/design/theme-provider";

export function StudioNavigation() {
  return authenticationEnabled ? <AuthenticatedNavigation /> : <Navigation />;
}
function AuthenticatedNavigation() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  return <Navigation isAuthenticated={isAuthenticated} isLoading={isLoading} />;
}
function Navigation({
  isAuthenticated = false,
  isLoading = false,
}: {
  isAuthenticated?: boolean;
  isLoading?: boolean;
}) {
  const c = useTheme();
  const dark = useResolvedColorScheme() === "dark";
  return (
    <ConnectionProvider>
      <Stack
        screenOptions={{
          headerUserInterfaceStyle: dark ? "dark" : "light",
          statusBarStyle: dark ? "light" : "dark",
          headerTintColor: c.foreground,
          contentStyle: { backgroundColor: c.background },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: "minimal",
        }}
      >
        <Stack.Screen
          name="settings"
          options={{
            title: "Settings",
            presentation: "fullScreenModal",
            headerShown: true,
          }}
        />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="compose"
          options={{
            title: "Create app",
            presentation:
              process.env.EXPO_OS === "ios" ? "formSheet" : "fullScreenModal",
            headerShown: true,
            sheetAllowedDetents: [1],
            sheetGrabberVisible: true,
          }}
        />
        <Stack.Screen name="guide-detail" options={{ title: "Guides" }} />
        <Stack.Screen name="example" options={{ title: "Inspiration" }} />
        <Stack.Protected guard={authenticationEnabled && !isAuthenticated}>
          <Stack.Screen
            name="(auth)"
            options={{ headerShown: false, presentation: "modal" }}
          />
        </Stack.Protected>
        <Stack.Protected
          guard={authenticationEnabled && (isLoading || isAuthenticated)}
        >
          <Stack.Screen
            name="connections"
            options={{ title: "Your connections" }}
          />
        </Stack.Protected>
        <Stack.Protected guard={authenticationEnabled}>
          <Stack.Screen
            name="(authenticated)"
            options={{ headerShown: false }}
          />
        </Stack.Protected>
      </Stack>
    </ConnectionProvider>
  );
}

export function AppTabs() {
  const c = useTheme();
  const accent = useAccentColor();
  return (
    <NativeTabs
      backgroundColor={process.env.EXPO_OS === "ios" ? undefined : c.background}
      indicatorColor={c.card}
      tintColor={accent}
      iconColor={{ default: c.mutedForeground, selected: accent }}
      labelStyle={{
        default: { color: c.mutedForeground },
        selected: { color: c.foreground },
      }}
    >
      <NativeTabs.Trigger name="(home)">
        <NativeTabs.Trigger.Label>Discover</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="sparkles" md="explore" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(apps)">
        <NativeTabs.Trigger.Label>Your apps</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }}
          md="apps"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(guides)">
        <NativeTabs.Trigger.Label>Guides</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "play.rectangle", selected: "play.rectangle.fill" }}
          md="play_circle"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
