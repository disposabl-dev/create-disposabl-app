import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Pressable } from "react-native";
import { useTheme } from "../../../../../packages/disposabl-kit/mobile/design/use-theme";

export function AccountButton() {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Settings"
      testID="settings-button"
      className="min-w-[44px] min-h-[44px] items-center justify-center"
      onPress={() => router.push("/settings")}
    >
      <SymbolView
        name={{ ios: "slider.horizontal.3", android: "tune" }}
        size={25}
        tintColor={c.foreground}
      />
    </Pressable>
  );
}
