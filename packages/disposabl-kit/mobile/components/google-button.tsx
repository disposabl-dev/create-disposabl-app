import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
} from "react-native";

export function GoogleButton({
  onPress,
  disabled = false,
  pending = false,
}: {
  onPress: () => void;
  disabled?: boolean;
  pending?: boolean;
}) {
  const dark = useColorScheme() === "dark";
  const color = dark ? "#E3E3E3" : "#1F1F1F";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Sign in with Google"
      accessibilityState={{ disabled: disabled || pending, busy: pending }}
      disabled={disabled || pending}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: dark ? "#131314" : "#FFFFFF",
          borderColor: dark ? "#8E918F" : "#747775",
          opacity: disabled || pending || pressed ? 0.6 : 1,
        },
      ]}
    >
      <Image
        source={require("../../lib/google-logo.png")}
        style={styles.logo}
        resizeMode="contain"
        accessible={false}
      />
      <Text style={[styles.label, { color }]}>
        {pending ? "Signing in..." : "Sign in with Google"}
      </Text>
      {pending && <ActivityIndicator color={color} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Platform.OS === "ios" ? 12 : 10,
    paddingHorizontal: Platform.OS === "ios" ? 16 : 12,
    paddingVertical: 14,
  },
  logo: { width: 20, height: 20 },
  label: { fontSize: 16, fontWeight: "500" },
});
