import type { PropsWithChildren } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
} from "react-native";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useTheme } from "../design/use-theme";

export function AuthScreen({ children }: PropsWithChildren) {
  const headerHeight = useHeaderHeight();
  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <ScrollView
        contentContainerClassName={authClasses.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function AuthButton({
  title,
  onPress,
  disabled = false,
  pending = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  pending?: boolean;
}) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || pending, busy: pending }}
      disabled={disabled || pending}
      onPress={onPress}
      className={`min-h-[52px] flex-row items-center justify-center gap-[10px] rounded-[12px] bg-foreground p-[14px] active:opacity-60 ${disabled || pending ? "opacity-60" : ""}`}
    >
      {pending && <ActivityIndicator color={c.background} />}
      <Text className="text-[17px] font-semibold text-background">{title}</Text>
    </Pressable>
  );
}

export const authClasses = {
  screen: "flex-1 bg-background",
  content:
    "w-full max-w-[480px] grow self-center justify-center gap-[16px] p-[24px] pb-[48px]",
  brandMark: "mb-[4px] size-[56px] rounded-[14px]",
  eyebrow: "text-[12px] font-bold tracking-[1.5px] text-muted-foreground",
  title: "text-[32px] font-bold tracking-[-0.7px] text-foreground",
  body: "text-[17px] leading-[25px] text-muted-foreground",
  label: "text-[14px] font-semibold text-foreground",
  field: "gap-[8px]",
  input:
    "min-h-[52px] rounded-[12px] border border-border bg-card p-[14px] text-[17px] text-foreground",
  link: "py-[8px] text-[15px] font-semibold text-primary-text",
  error: "text-[16px] leading-[23px] text-destructive",
  card: "gap-[12px] rounded-[16px] border border-border bg-card p-[20px]",
};
