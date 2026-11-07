import { Stack, useSegments } from "expo-router";
import { Platform, Text } from "react-native";
import { useTheme } from "../../../../../packages/disposabl-kit/mobile/design/use-theme";
import { HeaderActions } from "./ui";
import { useResolvedColorScheme } from "../../../../../packages/disposabl-kit/mobile/design/theme-provider";

const titles: Record<string, string> = {
  index: "Discover",
  apps: "Your apps",
  guides: "Guides",
};
export function TabStack() {
  const c = useTheme();
  const dark = useResolvedColorScheme() === "dark";
  const segments: readonly string[] = useSegments();
  const section = segments.includes("(apps)")
    ? "apps"
    : segments.includes("(guides)")
      ? "guides"
      : "index";
  return (
    <Stack
      screenOptions={({ route }) => {
        const title = (
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            style={{
              color: c.foreground,
              fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
              fontWeight: "700",
              fontSize: 34,
            }}
          >
            {titles[section] ?? route.name}
          </Text>
        );
        return {
          headerUserInterfaceStyle: dark ? "dark" : "light",
          statusBarStyle: dark ? "light" : "dark",
          headerLargeTitleEnabled: false,
          headerTitle: "",
          headerLeft: () => title,
          unstable_headerLeftItems: () => [
            { type: "custom", element: title, hidesSharedBackground: true },
          ],
          headerTransparent: false,
          headerShadowVisible: false,
          headerStyle: { backgroundColor: c.background },
          headerTintColor: c.foreground,
          contentStyle: { backgroundColor: c.background },
          headerRight: () => <HeaderActions />,
        };
      }}
    />
  );
}
