import { useTheme } from "../../../../../packages/disposabl-kit/mobile/design/use-theme";
import { Component, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f8f5ef" },
  content: { padding: 24, gap: 20, paddingBottom: 48 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  spread: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: { fontSize: 32, lineHeight: 38, fontWeight: "700", color: "#101a32" },
  heading: { fontSize: 21, fontWeight: "700", color: "#101a32" },
  text: { fontSize: 16, lineHeight: 23, color: "#101a32" },
  muted: { fontSize: 14, lineHeight: 21, color: "#566078" },
  card: {
    borderRadius: 24,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e9e5dd",
    padding: 20,
    gap: 12,
  },
  input: {
    minHeight: 100,
    textAlignVertical: "top",
    fontSize: 16,
    color: "#101a32",
    padding: 0,
  },
  button: {
    backgroundColor: "#101a32",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 30,
    alignSelf: "flex-start",
  },
  buttonText: { color: "white", fontSize: 15, fontWeight: "700" },
  chip: {
    borderWidth: 1,
    borderColor: "#c9c4bc",
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  selected: { backgroundColor: "#e9e5dd", borderColor: "#101a32" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
export function useStyles() {
  const c = useTheme();
  return {
    ...styles,
    screen: { ...styles.screen, backgroundColor: c.background },
    title: { ...styles.title, color: c.foreground },
    heading: { ...styles.heading, color: c.foreground },
    text: { ...styles.text, color: c.foreground },
    muted: { ...styles.muted, color: c.mutedForeground },
    card: { ...styles.card, backgroundColor: c.card, borderColor: c.border },
    input: { ...styles.input, color: c.foreground },
    button: { ...styles.button, backgroundColor: c.foreground },
    buttonText: { ...styles.buttonText, color: c.background },
    chip: { ...styles.chip, borderColor: c.border },
    selected: {
      ...styles.selected,
      backgroundColor: c.muted,
      borderColor: c.foreground,
    },
  };
}
export function Button({
  title,
  onPress,
  disabled = false,
  testID,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && { opacity: 0.5 }]}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}
export function Loading() {
  return <ActivityIndicator accessibilityLabel="Loading" />;
}
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: string; attempt: number }
> {
  state = { error: "", attempt: 0 };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    if (this.state.error)
      return (
        <View style={styles.card}>
          <Text style={styles.text}>Unable to load this screen.</Text>
          <Text style={styles.muted}>{this.state.error}</Text>
          <Button
            title="Retry"
            onPress={() =>
              this.setState(({ attempt }) => ({
                error: "",
                attempt: attempt + 1,
              }))
            }
          />
        </View>
      );
    return (
      <View key={this.state.attempt} style={{ flex: 1 }}>
        {this.props.children}
      </View>
    );
  }
}
