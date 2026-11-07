import type { PropsWithChildren } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
} from "react-native";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useTheme } from "../design/use-theme";

export function AuthScreen({ children }: PropsWithChildren) {
  const styles = useAuthStyles();
  const headerHeight = useHeaderHeight();
  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <ScrollView
        contentContainerStyle={styles.content}
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
  const styles = useAuthStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || pending, busy: pending }}
      disabled={disabled || pending}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        (disabled || pending || pressed) && styles.dimmed,
      ]}
    >
      {pending && <ActivityIndicator color={styles.buttonText.color} />}
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}

export function useAuthStyles() {
  const c = useTheme();
  return {
    ...styles,
    screen: { ...styles.screen, backgroundColor: c.background },
    title: { ...styles.title, color: c.foreground },
    label: { ...styles.label, color: c.foreground },
    body: { ...styles.body, color: c.mutedForeground },
    eyebrow: { ...styles.eyebrow, color: c.mutedForeground },
    input: {
      ...styles.input,
      color: c.foreground,
      backgroundColor: c.card,
      borderColor: c.border,
    },
    button: { ...styles.button, backgroundColor: c.foreground },
    buttonText: { ...styles.buttonText, color: c.background },
    link: { ...styles.link, color: c.primaryText },
    error: { ...styles.error, color: c.destructive },
    card: { ...styles.card, backgroundColor: c.card, borderColor: c.border },
  };
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#faf9f6" },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
    paddingBottom: 48,
    gap: 16,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
  },
  brandMark: { width: 56, height: 56, borderRadius: 14, marginBottom: 4 },
  eyebrow: {
    color: "#687080",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  title: {
    color: "#161b2e",
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: -0.7,
  },
  body: { color: "#495269", fontSize: 17, lineHeight: 25 },
  label: { color: "#161b2e", fontSize: 14, fontWeight: "600" },
  field: { gap: 8 },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: "#d9dce3",
    borderRadius: 12,
    backgroundColor: "#fff",
    padding: 14,
    color: "#161b2e",
    fontSize: 17,
  },
  button: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: "#161b2e",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 14,
  },
  buttonText: { color: "#fff", fontSize: 17, fontWeight: "600" },
  dimmed: { opacity: 0.6 },
  link: {
    color: "#2855c5",
    fontSize: 15,
    fontWeight: "600",
    paddingVertical: 8,
  },
  error: { color: "#a31928", fontSize: 16, lineHeight: 23 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e0e4ed",
    padding: 20,
    gap: 12,
  },
});
