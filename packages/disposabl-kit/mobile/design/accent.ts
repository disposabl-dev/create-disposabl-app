export const accentPreferences = [
  "blue",
  "green",
  "yellow",
  "pink",
  "orange",
  "purple",
  "black",
] as const;

export type AccentPreference = (typeof accentPreferences)[number];

export const accentColors: Record<AccentPreference, string> = {
  blue: "#208aef",
  green: "#00c46a",
  yellow: "#ffbd0a",
  pink: "#f65fa0",
  orange: "#f97316",
  purple: "#7c5cff",
  black: "#000000",
};

export function isAccentPreference(
  value: string | null,
): value is AccentPreference {
  return accentPreferences.includes(value as AccentPreference);
}

export function resolvedAccentColor(accent: AccentPreference, isDark: boolean) {
  return accent === "black" && isDark ? "#ffffff" : accentColors[accent];
}
