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
  style,
  notice,
}: {
  children: ReactNode;
  title: string;
  notice?: string;
  style?: ComponentProps<typeof ScrollView>["contentContainerStyle"];
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1, backgroundColor: c.background }}
        contentContainerStyle={[
          {
            paddingLeft: Math.max(insets.left, space.gutter),
            paddingRight: Math.max(insets.right, space.gutter),
            paddingTop: space.body,
            paddingBottom: space.wide,
            gap: space.section,
            width: "100%",
            maxWidth: 760,
            alignSelf: "center",
          },
          style,
        ]}
      >
        {children}
      </ScrollView>
      <Stack.Screen options={{ title }} />
      {notice ? (
        <View
          accessibilityRole="alert"
          pointerEvents="none"
          style={{
            position: "absolute",
            bottom: Math.max(insets.bottom, 24),
            left: 24,
            right: 24,
            padding: 18,
            borderRadius: 18,
            backgroundColor: c.foreground,
          }}
        >
          <NativeLabel color={c.background}>{notice}</NativeLabel>
        </View>
      ) : null}
    </>
  );
}
export function HeaderActions() {
  const router = useRouter();
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      <Touch
        label="Create a new app"
        onPress={() => router.push("/compose")}
        style={{ width: 44, alignItems: "center", justifyContent: "center" }}
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
      style={{ flexDirection: "row", gap: space.compact, flexWrap: "wrap" }}
    >
      {targets.map((t) => (
        <View
          key={t}
          style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
        >
          <Icon name={t} size={15} color={c.mutedForeground} />
          <Text style={{ fontSize: 12, color: c.mutedForeground }}>
            {targetNames[t]}
          </Text>
        </View>
      ))}
    </View>
  );
}
