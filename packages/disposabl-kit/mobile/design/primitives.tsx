import { Host, GlassView } from "./nativewind";
import { Text as NativeText } from "@expo/ui";
import { fillMaxWidth } from "@expo/ui/jetpack-compose/modifiers";
import {
  frame,
  buttonStyle,
  foregroundStyle,
} from "@expo/ui/swift-ui/modifiers";
import { NativeButton } from "./native-button";
import { useTheme } from "./use-theme";
import {
  useColorScheme,
  AccessibilityInfo,
  useWindowDimensions,
  Pressable,
  View,
} from "react-native";
import {
  isLiquidGlassAvailable,
  isGlassEffectAPIAvailable,
} from "expo-glass-effect";
import { useEffect, useState, type ReactNode } from "react";

export const space = {
  tiny: 4,
  small: 8,
  compact: 12,
  body: 16,
  gutter: 24,
  section: 32,
  wide: 48,
};
export const shape = { small: 12, card: 28, pill: 100 };
export const type = {
  display: { fontSize: 38, fontWeight: "700", letterSpacing: -1.4 },
  title: { fontSize: 27, fontWeight: "700", letterSpacing: -0.7 },
  heading: { fontSize: 20, fontWeight: "600", letterSpacing: -0.3 },
  body: { fontSize: 17, fontWeight: "400" },
  label: { fontSize: 15, fontWeight: "600" },
  caption: { fontSize: 13, fontWeight: "400" },
  eyebrow: { fontSize: 11, fontWeight: "700", letterSpacing: 1.4 },
} as const;

export function NativeLabel({
  children,
  variant = "body",
  color,
  center = false,
  inline = false,
}: {
  children: string;
  variant?: keyof typeof type;
  color?: string;
  center?: boolean;
  inline?: boolean;
}) {
  const colors = useTheme();
  const scheme = useColorScheme();
  const { fontScale } = useWindowDimensions();
  return (
    <Host
      pointerEvents="none"
      matchContents={inline ? true : { vertical: true }}
      colorScheme={scheme ?? "dark"}
      className={inline ? undefined : "w-full"}
    >
      <NativeText
        modifiers={
          inline
            ? []
            : process.env.EXPO_OS === "ios"
              ? [
                  frame({
                    maxWidth: Infinity,
                    alignment: center ? "center" : "leading",
                  }),
                ]
              : [fillMaxWidth()]
        }
        textStyle={{
          ...type[variant],
          fontSize:
            type[variant].fontSize *
            (process.env.EXPO_OS === "ios" ? fontScale : 1),
          color: color ?? colors.foreground,
          textAlign: center ? "center" : "left",
        }}
      >
        {children}
      </NativeText>
    </Host>
  );
}
export function NativeAction({
  label,
  onPress,
  secondary = false,
  disabled = false,
  compact = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  compact?: boolean;
}) {
  const colors = useTheme();
  const scheme = useColorScheme();
  return (
    <View className={compact ? "self-start max-w-[100%]" : "w-[100%]"}>
      <Host
        matchContents={compact ? true : { vertical: true }}
        colorScheme={scheme ?? "dark"}
        seedColor={
          process.env.EXPO_OS === "android" ? colors.primary : colors.foreground
        }
        className={compact ? "min-h-[48px]" : "min-h-[48px] w-full"}
      >
        <NativeButton
          label={label}
          modifiers={
            process.env.EXPO_OS === "ios" &&
            isGlassEffectAPIAvailable() &&
            isLiquidGlassAvailable()
              ? [
                  buttonStyle(secondary ? "glass" : "glassProminent"),
                  foregroundStyle(
                    secondary ? colors.foreground : colors.background,
                  ),
                ]
              : process.env.EXPO_OS === "android" && !compact
                ? [fillMaxWidth()]
                : undefined
          }
          variant={secondary ? "outlined" : "filled"}
          disabled={disabled}
          onPress={onPress}
        />
      </Host>
    </View>
  );
}
export function GlassSurface({
  children,
  className,
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  const [solid, setSolid] = useState(true);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceTransparencyEnabled().then((value) => {
      if (mounted) setSolid(value);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      setSolid,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  const glass =
    !solid && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  return glass ? (
    <GlassView
      glassEffectStyle="regular"
      isInteractive={interactive}
      className={className ?? "rounded-[28px]"}
    >
      {children}
    </GlassView>
  ) : (
    <View className={`bg-card ${className ?? "rounded-[28px]"}`}>
      {children}
    </View>
  );
}
export function Touch({
  children,
  onPress,
  label,
  selected,
  className,
}: {
  children: ReactNode;
  onPress: () => void;
  label: string;
  selected?: boolean;
  className?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`min-h-[48px] active:opacity-[0.65] ${className ?? ""}`}
    >
      {children}
    </Pressable>
  );
}
