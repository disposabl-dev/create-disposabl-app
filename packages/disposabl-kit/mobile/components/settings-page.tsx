import { VariableContextProvider } from "nativewind";
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
            <Text className="text-[#18181b] dark:text-[#fafafa] text-[16px] font-semibold p-[8px]">
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
      <VariableContextProvider
        value={{ "--layout-padding-bottom": inset.bottom + 32 }}
      >
        <ScrollView
          className="flex-1 bg-[#fafafa] dark:bg-[#09090b]"
          contentInsetAdjustmentBehavior="automatic"
          contentContainerClassName="px-[20px] pt-[16px] pb-[var(--layout-padding-bottom)] w-[100%] max-w-[680px] self-center"
        >
          {children}
        </ScrollView>
      </VariableContextProvider>
    </>
  );
}
