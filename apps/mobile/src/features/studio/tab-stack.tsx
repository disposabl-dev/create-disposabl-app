import { Stack, useSegments } from "expo-router";
import { Platform, Text } from "react-native";
import { useTheme } from "../../../../../packages/disposabl-kit/mobile/design/use-theme";
import { HeaderActions } from "./ui";
import { useResolvedColorScheme } from "@disposabl/disposabl-kit/mobile";

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
            maxFontSizeMultiplier={1.3}
            className={`max-w-[180px] text-[34px] font-bold text-foreground ${Platform.OS === "ios" ? "font-[Georgia]" : "font-serif"}`}
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
            {
              type: "custom",
              element: title,
              hidesSharedBackground: true,
              visibilityPriority: "high",
            },
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
