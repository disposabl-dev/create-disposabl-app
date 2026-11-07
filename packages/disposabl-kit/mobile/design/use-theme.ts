import { useNativeVariable } from "react-native-css/native";

// Native appearance props need resolved colors rather than className utilities.
function useThemeColor(name: string): string {
  const value = useNativeVariable(name);
  if (typeof value !== "string") {
    throw new Error(`Missing mobile theme color: ${name}`);
  }
  return value;
}

export function useTheme() {
  return {
    background: useThemeColor("--background"),
    foreground: useThemeColor("--foreground"),
    card: useThemeColor("--card"),
    cardForeground: useThemeColor("--card-foreground"),
    primary: useThemeColor("--primary"),
    primaryForeground: useThemeColor("--primary-foreground"),
    primaryText: useThemeColor("--primary-text"),
    muted: useThemeColor("--muted"),
    mutedForeground: useThemeColor("--muted-foreground"),
    border: useThemeColor("--border"),
    destructive: useThemeColor("--destructive"),
    destructiveForeground: useThemeColor("--destructive-foreground"),
  };
}
