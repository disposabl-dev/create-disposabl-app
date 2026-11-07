import { router, Stack } from "expo-router";
import type { ReactNode } from "react";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePreferenceColors } from "../design/preferences";

/** Native navigation owns the header and safe-area placement on every screen size. */
export function SettingsPage({
  title = "Settings",
  children,
  onClose = () => (router.canGoBack() ? router.back() : router.replace("/")),
}: {
  title?: string;
  children: ReactNode;
  onClose?: () => void;
}) {
  const colors = usePreferenceColors();
  const inset = useSafeAreaInsets();
  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerShown: true,
          headerTransparent: false,
          headerBackVisible: false,
          headerTintColor: colors.text,
          headerUserInterfaceStyle: colors.dark ? "dark" : "light",
          statusBarStyle: colors.dark ? "light" : "dark",
          headerStyle: { backgroundColor: colors.background },
          contentStyle: { backgroundColor: colors.background },
        }}
      />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel="Close settings"
          onPress={onClose}
        >
          Done
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: inset.bottom + 32,
          width: "100%",
          maxWidth: 680,
          alignSelf: "center",
        }}
      >
        {children}
      </ScrollView>
    </>
  );
}
