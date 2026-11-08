import { VariableContextProvider } from "nativewind";
import { ScrollView, View, Text } from "react-native";
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useTheme } from "../../../../../packages/disposabl-kit/mobile/design/use-theme";
import {
  NativeLabel,
  NativeAction,
  GlassSurface,
  Touch,
  space,
  shape,
} from "../../../../../packages/disposabl-kit/mobile/design/primitives";
import { useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type ComponentProps, type ReactNode } from "react";
import { AccountButton } from "./account-button";
import { type Target, targetNames } from "./data";
export {
  NativeLabel as Label,
  NativeAction as Action,
  GlassSurface,
  Touch,
  space,
  shape,
};
export const feedback = () => {
  void Haptics.selectionAsync().catch(() => undefined);
};
const symbols = {
  book: ["book.closed", "menu-book"],
  copy: ["doc.on.doc", "content-copy"],
  file: ["paperclip", "attach-file"],
  send: ["arrow.up", "arrow-upward"],
  more: ["ellipsis", "more-horiz"],
  compose: ["square.and.pencil", "edit-square"],
  grid: ["square.grid.2x2", "apps"],
  plus: ["plus", "add"],
  close: ["xmark", "close"],
  arrow: ["arrow.up.right", "north-east"],
  web: ["globe", "language"],
  ios: ["apple.logo", "phone-iphone"],
  android: ["android.logo", "android"],
  api: ["curlybraces", "data-object"],
  mcp: ["point.3.connected.trianglepath.dotted", "hub"],
  cli: ["terminal", "terminal"],
  leaf: ["leaf.fill", "eco"],
  chat: ["bubble.left.and.bubble.right.fill", "forum"],
  voice: ["waveform", "graphic-eq"],
  camera: ["camera.fill", "photo-camera"],
  orbit: ["circle.dotted.circle", "track-changes"],
  share: ["square.and.arrow.up", "ios-share"],
  heart: ["heart", "favorite-border"],
  comment: ["bubble", "chat-bubble-outline"],
  check: ["checkmark", "check"],
  play: ["play.fill", "play-arrow"],
  settings: ["slider.horizontal.3", "tune"],
  mic: ["mic", "mic"],
  photo: ["photo", "image"],
  chevron: ["chevron.right", "chevron-right"],
} as const;
export type Glyph = keyof typeof symbols;
export function Icon({
  name,
  size = 22,
  color,
}: {
  name: Glyph;
  size?: number;
  color?: string;
}) {
  const c = useTheme();
  return process.env.EXPO_OS === "ios" && name !== "android" ? (
    <SymbolView
      name={symbols[name][0] as ComponentProps<typeof SymbolView>["name"]}
      size={size}
      tintColor={color ?? c.foreground}
    />
  ) : (
    <MaterialIcons
      name={symbols[name][1]}
      size={size}
      color={color ?? c.foreground}
    />
  );
}
export function Screen({
  children,
  title,
  contentClassName = "gap-[32px]",
  notice,
}: {
  children: ReactNode;
  title: string;
  notice?: string;
  contentClassName?: string;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <VariableContextProvider
      value={{
        "--screen-left": Math.max(insets.left, space.gutter),
        "--screen-right": Math.max(insets.right, space.gutter),
      }}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        className="flex-1 bg-background"
        contentContainerClassName={`w-full max-w-[760px] self-center pt-[16px] pb-[48px] pl-[var(--screen-left)] pr-[var(--screen-right)] ${contentClassName}`}
      >
        {children}
      </ScrollView>
      <Stack.Screen options={{ title }} />
      {notice ? (
        <VariableContextProvider
          value={{ "--layout-bottom": Math.max(insets.bottom, 24) }}
        >
          <View
            accessibilityRole="alert"
            pointerEvents="none"
            className="absolute bottom-[var(--layout-bottom)] left-[24px] right-[24px] p-[18px] rounded-[18px] bg-foreground"
          >
            <NativeLabel color={c.background}>{notice}</NativeLabel>
          </View>
        </VariableContextProvider>
      ) : null}
    </VariableContextProvider>
  );
}
export function HeaderActions() {
  const router = useRouter();
  return (
    <View className="flex-row gap-[4px]">
      <Touch
        label="Create a new app"
        onPress={() => router.push("/compose")}
        className="w-[44px] items-center justify-center"
      >
        <Icon name="plus" />
      </Touch>
      <AccountButton />
    </View>
  );
}
export function TargetBadges({ targets }: { targets: Target[] }) {
  const c = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`Available for ${targets.map((t) => targetNames[t]).join(", ")}`}
      className="flex-row gap-[12px] flex-wrap"
    >
      {targets.map((t) => (
        <View key={t} className="flex-row items-center gap-[4px]">
          <Icon name={t} size={15} color={c.mutedForeground} />
          <Text className="text-[12px] text-muted-foreground">
            {targetNames[t]}
          </Text>
        </View>
      ))}
    </View>
  );
}
