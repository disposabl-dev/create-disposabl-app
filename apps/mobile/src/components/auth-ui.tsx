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

export function AuthScreen({ children }: PropsWithChildren) {
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
      {pending && <ActivityIndicator color="#fff" />}
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f6fa" },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
    paddingBottom: 48,
    gap: 20,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
  },
  title: { color: "#161b2e", fontSize: 32, fontWeight: "700" },
  body: { color: "#495269", fontSize: 17, lineHeight: 25 },
  label: { color: "#161b2e", fontSize: 16, fontWeight: "600" },
  field: { gap: 8 },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: "#bec5d4",
    borderRadius: 12,
    backgroundColor: "#fff",
    padding: 14,
    color: "#161b2e",
    fontSize: 17,
  },
  button: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: "#2855c5",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 14,
  },
  buttonText: { color: "#fff", fontSize: 17, fontWeight: "600" },
  dimmed: { opacity: 0.6 },
  link: { color: "#2855c5", fontSize: 17, paddingVertical: 12 },
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
