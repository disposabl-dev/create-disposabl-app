export const androidArchitectures = [
  "arm64-v8a",
  "x86_64",
  "armeabi-v7a",
  "x86",
] as const;

export type AndroidArchitecture = (typeof androidArchitectures)[number];

export const defaultAndroidArchitectures: readonly AndroidArchitecture[] = [
  "arm64-v8a",
  "x86_64",
];

/** Validate persisted selections and return them in a stable order. */
export function validateAndroidArchitectures(
  values: unknown = defaultAndroidArchitectures,
): AndroidArchitecture[] {
  if (!Array.isArray(values) || values.length === 0)
    throw new Error("Select at least one Android architecture.");
  const selected = new Set<AndroidArchitecture>();
  for (const value of values) {
    if (
      typeof value !== "string" ||
      !androidArchitectures.includes(value as AndroidArchitecture)
    )
      throw new Error(
        `Unknown Android architecture: ${JSON.stringify(value)}.`,
      );
    if (selected.has(value as AndroidArchitecture))
      throw new Error(`Duplicate Android architecture: ${value}.`);
    selected.add(value as AndroidArchitecture);
  }
  return androidArchitectures.filter((value) => selected.has(value));
}
