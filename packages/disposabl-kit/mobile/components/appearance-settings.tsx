import { VariableContextProvider } from "nativewind";
import type { MenuAction } from "@expo/ui/community/menu";
import { MenuView } from "../design/nativewind";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { Platform, View } from "react-native";
import {
  PreferenceRow,
  PreferenceSection,
  PreferenceSeparator,
  usePreferenceColors,
} from "../design/preferences";
import { ThemedText } from "../design/themed-text";
import {
  accentColors,
  accentPreferences,
  useAccentColor,
  useAccentPreference,
  useThemePreference,
  type ThemePreference,
} from "../design/theme-provider";

export function AppearanceSettings() {
  const colors = usePreferenceColors();
  const { preference, setPreference } = useThemePreference();
  const { accent, setAccent } = useAccentPreference();
  const accentColor = useAccentColor();
  const labels = { system: "System", light: "Light", dark: "Dark" };
  return (
    <PreferenceSection title="Theme">
      <PreferenceMenu
        label="Appearance"
        icon={{ ios: "moon", android: "dark_mode" }}
        value={labels[preference]}
        actions={(["system", "light", "dark"] as const).map((value) => ({
          id: value,
          title: labels[value],
          state: preference === value ? "on" : "off",
        }))}
        onSelect={(value) => setPreference(value as ThemePreference)}
      />
      <PreferenceSeparator />
      <PreferenceMenu
        label="Accent color"
        icon={{ ios: "paintpalette", android: "palette" }}
        value={title(accent)}
        valueColor={accentColor}
        actions={accentPreferences.map((value) => ({
          id: value,
          title: title(value),
          state: accent === value ? "on" : "off",
          image: "circle.fill",
          imageColor:
            value === "black" && colors.dark ? "#ffffff" : accentColors[value],
        }))}
        onSelect={(value) => {
          if (accentPreferences.includes(value as typeof accent))
            setAccent(value as typeof accent);
        }}
      />
    </PreferenceSection>
  );
}

const title = (value: string) => value[0]!.toUpperCase() + value.slice(1);

function PreferenceMenu({
  actions,
  onSelect,
  icon,
  label,
  value,
  valueColor,
}: {
  actions: MenuAction[];
  onSelect: (value: string) => void;
  icon: SymbolViewProps["name"];
  label: string;
  value: string;
  valueColor?: string;
}) {
  const colors = usePreferenceColors();
  return (
    <VariableContextProvider
      value={{ "--swatch": valueColor ?? "transparent" }}
    >
      <PreferenceRow
        icon={icon}
        label={label}
        trailing={
          <MenuView
            testID={`${label}-menu`}
            className="max-w-[55%] shrink"
            actions={actions}
            onPressAction={({ nativeEvent }) => onSelect(nativeEvent.event)}
          >
            <View
              collapsable={false}
              pointerEvents={Platform.OS === "ios" ? "none" : "auto"}
              accessibilityRole="button"
              accessibilityLabel={`${label}: ${value}`}
              className="min-h-[44px] flex-row items-center gap-[8px]"
            >
              {valueColor && (
                <View className="size-[14px] rounded-full bg-[var(--swatch)]" />
              )}
              <ThemedText className="text-[#71717a] dark:text-[#a1a1aa] text-[16px] shrink">
                {value}
              </ThemedText>
              <SymbolView
                name={{
                  ios: "chevron.up.chevron.down",
                  android: "unfold_more",
                }}
                size={13}
                tintColor={colors.secondary}
              />
            </View>
          </MenuView>
        }
      />
    </VariableContextProvider>
  );
}
