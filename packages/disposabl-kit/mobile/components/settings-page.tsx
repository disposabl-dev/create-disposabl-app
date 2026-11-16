import { VariableContextProvider } from "nativewind";
import { router, Stack } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePreferenceColors } from "../design/preferences";
import { useAccentColor } from "../design/theme-provider";
import { SymbolView } from "../design/nativewind";

export function ScreenCloseButton({
  label,
  onPress,
  purpose = "close",
}: {
  label: string;
  onPress: () => void;
  purpose?: "done" | "close";
}) {
  const accent = useAccentColor();
  const colors = usePreferenceColors();
  const done = purpose === "done";
  return process.env.EXPO_OS === "ios" ? (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button
        accessibilityLabel={label}
        icon={done ? "checkmark" : "xmark"}
        tintColor={done ? accent : colors.text}
        variant={done ? "prominent" : "plain"}
        onPress={onPress}
      />
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
            className="min-h-[44px] min-w-[44px] items-center justify-center"
          >
            <SymbolView
              name={{
                ios: done ? "checkmark" : "xmark",
                android: done ? "check" : "close",
              }}
              size={24}
              tintColor={done ? accent : colors.text}
            />
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
      <ScreenCloseButton
        label="Close settings"
        purpose="done"
        onPress={onClose}
      />
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
