import { router, Stack } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePreferenceColors } from "../design/preferences";

export function ScreenCloseButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const colors = usePreferenceColors();
  return process.env.EXPO_OS === "ios" ? (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button accessibilityLabel={label} onPress={onPress}>
        Done
      </Stack.Toolbar.Button>
    </Stack.Toolbar>
  ) : (
    <Stack.Screen
      options={{
        headerRight: () => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            hitSlop={12}
            onPress={onPress}
          >
            <Text
              style={{
                color: colors.text,
                fontSize: 16,
                fontWeight: "600",
                padding: 8,
              }}
            >
              Done
            </Text>
          </Pressable>
        ),
      }}
    />
  );
}

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
      <ScreenCloseButton label="Close settings" onPress={onClose} />
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
