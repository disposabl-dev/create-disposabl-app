import { VariableContextProvider } from "nativewind";
import {
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import type { SymbolViewProps } from "expo-symbols";
import { GlassView, SymbolView } from "./nativewind";
import type { ReactNode } from "react";
import { Platform, Pressable, View } from "react-native";
import { useResolvedColorScheme } from "./theme-provider";
import { ThemedText } from "./themed-text";

export function usePreferenceColors() {
  const dark = useResolvedColorScheme() === "dark";
  return {
    dark,
    background: dark ? "#09090b" : "#fafafa",
    card: dark ? "#18181b" : "#ffffff",
    text: dark ? "#fafafa" : "#18181b",
    secondary: dark ? "#a1a1aa" : "#71717a",
    separator: dark ? "#27272a" : "#e4e4e7",
    destructive: dark ? "#f87171" : "#dc2626",
  };
}

export function PreferenceSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View className="mt-7">
      <ThemedText className="mb-3 ml-4 text-[#71717a] dark:text-[#a1a1aa] text-[19px] font-semibold">
        {title}
      </ThemedText>
      <PreferenceCard>{children}</PreferenceCard>
    </View>
  );
}

export function PreferenceCard({ children }: { children: ReactNode }) {
  return (
    <View className="overflow-hidden rounded-[24px] bg-[#ffffff] dark:bg-[#18181b]">
      {children}
    </View>
  );
}

export function PreferenceSeparator() {
  return <View className="ml-[58px] h-px bg-[#e4e4e7] dark:bg-[#27272a]" />;
}

export function PreferenceIcon({
  icon,
  color,
}: {
  icon: SymbolViewProps["name"];
  color?: string;
}) {
  const colors = usePreferenceColors();
  return <SymbolView name={icon} size={23} tintColor={color ?? colors.text} />;
}

/** A compact trailing action for a settings row, such as revealing private text. */
export function PreferenceIconButton({
  icon,
  label,
  onPress,
}: {
  icon: SymbolViewProps["name"];
  label: string;
  onPress: () => void;
}) {
  const colors = usePreferenceColors();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      className="h-11 w-11 items-center justify-center active:opacity-60"
    >
      <SymbolView name={icon} size={19} tintColor={colors.secondary} />
    </Pressable>
  );
}

export function PreferenceRow({
  icon,
  label,
  value,
  onPress,
  destructive = false,
  disabled = false,
  trailing,
  width,
}: {
  icon: SymbolViewProps["name"];
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  trailing?: ReactNode;
  width?: number;
}) {
  const colors = usePreferenceColors();
  const color = destructive ? colors.destructive : colors.text;
  const content = (
    <>
      <SymbolView name={icon} size={23} tintColor={color} />
      <ThemedText
        className={`ml-4 flex-1 text-[17px] ${destructive ? "text-[#dc2626] dark:text-[#f87171]" : "text-[#18181b] dark:text-[#fafafa]"}`}
      >
        {label}
      </ThemedText>
      {value ? (
        <ThemedText
          className="ml-3 max-w-[48%] text-right text-[16px] text-[#71717a] dark:text-[#a1a1aa]"
          numberOfLines={1}
        >
          {value}
        </ThemedText>
      ) : null}
      {trailing ??
        (onPress ? (
          <SymbolView
            name={{ ios: "chevron.right", android: "chevron_right" }}
            size={13}
            tintColor={colors.secondary}
            className="ml-[8px]"
          />
        ) : null)}
    </>
  );
  return onPress ? (
    <VariableContextProvider value={{ "--layout-width": width ?? "auto" }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={onPress}

        className="min-h-[60px] flex-row items-center px-5 py-3 active:opacity-60 disabled:opacity-50 w-[var(--layout-width)]"
      >
        {content}
      </Pressable>
    </VariableContextProvider>
  ) : (
    <VariableContextProvider value={{ "--layout-width": width ?? "auto" }}>
      <View className="min-h-[60px] flex-row items-center px-5 py-3 w-[var(--layout-width)]">
        {content}
      </View>
    </VariableContextProvider>
  );
}

export function GlassIconButton({
  label,
  icon,
  onPress,
  plain = false,
}: {
  label: string;
  icon: SymbolViewProps["name"];
  onPress: () => void;
  plain?: boolean;
}) {
  const colors = usePreferenceColors();
  const glass =
    Platform.OS === "ios" &&
    isLiquidGlassAvailable() &&
    isGlassEffectAPIAvailable();
  const symbol = (
    <SymbolView
      name={icon}
      size={22}
      tintColor={colors.text}
      weight="semibold"
    />
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      className="h-12 w-12 active:opacity-60"
    >
      {plain ? (
        <View className="h-12 w-12 items-center justify-center">{symbol}</View>
      ) : glass ? (
        <GlassView
          isInteractive
          colorScheme={colors.dark ? "dark" : "light"}
          glassEffectStyle="regular"
          className="size-[48px] items-center justify-center rounded-[24px]"
        >
          {symbol}
        </GlassView>
      ) : (
        <View className="h-12 w-12 items-center justify-center rounded-full bg-[#ffffff] dark:bg-[#18181b] border-[1px] border-[#e4e4e7] dark:border-[#27272a]">
          {symbol}
        </View>
      )}
    </Pressable>
  );
}
