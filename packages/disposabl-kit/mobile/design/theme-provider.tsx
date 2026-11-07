import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as RouterThemeProvider,
} from "expo-router";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Appearance, View, useColorScheme } from "react-native";
import { useNativeVariable } from "react-native-css/native";

import { useTheme } from "./use-theme";

import { isAccentPreference, type AccentPreference } from "./accent";

export type ThemePreference = "system" | "light" | "dark";
export {
  accentColors,
  accentPreferences,
  resolvedAccentColor,
  type AccentPreference,
} from "./accent";

type ThemePreferenceContextValue = {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};
type AccentPreferenceContextValue = {
  accent: AccentPreference;
  setAccent: (accent: AccentPreference) => void;
};

const themePreferenceKey = "app-theme";
const accentPreferenceKey = "app-accent";
const ThemePreferenceContext =
  createContext<ThemePreferenceContextValue | null>(null);
const AccentPreferenceContext =
  createContext<AccentPreferenceContextValue | null>(null);
const accentClasses: Record<AccentPreference, string> = {
  blue: "accent-blue",
  green: "accent-green",
  yellow: "accent-yellow",
  pink: "accent-pink",
  orange: "accent-orange",
  purple: "accent-purple",
  black: "accent-black",
};

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function NavigationTheme({ children }: { children: ReactNode }) {
  const isDark = useResolvedColorScheme() === "dark";
  const colors = useTheme();
  const baseTheme = isDark ? DarkTheme : DefaultTheme;

  return (
    <RouterThemeProvider
      value={{
        ...baseTheme,
        colors: {
          ...baseTheme.colors,
          primary: colors.primary,
          background: colors.background,
          card: colors.card,
          text: colors.foreground,
          border: colors.border,
          notification: colors.destructive,
        },
      }}
    >
      <StatusBar style={isDark ? "light" : "dark"} />
      {children}
    </RouterThemeProvider>
  );
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [accent, setAccentState] = useState<AccentPreference>("blue");
  const hasUserThemePreference = useRef(false);
  const hasUserAccentPreference = useRef(false);
  const saveThemePreference = useRef(Promise.resolve());
  const saveAccentPreference = useRef(Promise.resolve());

  useEffect(() => {
    let mounted = true;

    void SecureStore.getItemAsync(themePreferenceKey)
      .then((savedPreference) => {
        if (
          mounted &&
          !hasUserThemePreference.current &&
          isThemePreference(savedPreference)
        ) {
          setPreferenceState(savedPreference);
        }
      })
      .catch(() => undefined);
    void SecureStore.getItemAsync(accentPreferenceKey)
      .then((savedAccent) => {
        if (
          mounted &&
          !hasUserAccentPreference.current &&
          isAccentPreference(savedAccent)
        ) {
          setAccentState(savedAccent);
        }
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, []);

  useLayoutEffect(() => {
    Appearance.setColorScheme(preference === "system" ? "auto" : preference);
  }, [preference]);

  const themePreferenceValue = useMemo<ThemePreferenceContextValue>(
    () => ({
      preference,
      setPreference(nextPreference) {
        hasUserThemePreference.current = true;
        setPreferenceState(nextPreference);
        saveThemePreference.current = saveThemePreference.current
          .then(() =>
            SecureStore.setItemAsync(themePreferenceKey, nextPreference),
          )
          .catch(() => undefined);
      },
    }),
    [preference],
  );
  const accentPreferenceValue = useMemo<AccentPreferenceContextValue>(
    () => ({
      accent,
      setAccent(nextAccent) {
        hasUserAccentPreference.current = true;
        setAccentState(nextAccent);
        saveAccentPreference.current = saveAccentPreference.current
          .then(() => SecureStore.setItemAsync(accentPreferenceKey, nextAccent))
          .catch(() => undefined);
      },
    }),
    [accent],
  );

  return (
    <ThemePreferenceContext value={themePreferenceValue}>
      <AccentPreferenceContext value={accentPreferenceValue}>
        <View className={`flex-1 ${accentClasses[accent]}`}>
          <NavigationTheme>{children}</NavigationTheme>
        </View>
      </AccentPreferenceContext>
    </ThemePreferenceContext>
  );
}

export function useThemePreference(): ThemePreferenceContextValue {
  const value = useContext(ThemePreferenceContext);
  if (!value) {
    throw new Error("useThemePreference must be used inside ThemeProvider");
  }
  return value;
}

export function useResolvedColorScheme() {
  const systemColorScheme = useColorScheme();
  const { preference } = useThemePreference();
  return preference === "system" ? systemColorScheme : preference;
}

export function useAccentPreference(): AccentPreferenceContextValue {
  const value = useContext(AccentPreferenceContext);
  if (!value) {
    throw new Error("useAccentPreference must be used inside ThemeProvider");
  }
  return value;
}

export function useAccentColor() {
  const value = useNativeVariable("--accent");
  if (typeof value !== "string")
    throw new Error("Accent color requires ThemeProvider.");
  return value;
}
