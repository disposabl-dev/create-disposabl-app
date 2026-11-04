export const features = [
  {
    id: "faster-ci",
    label: "Faster CI",
    hint: "Blacksmith GitHub Actions runners",
  },
  { id: "docs", label: "Docs", hint: "apps/docs" },
  {
    id: "authentication",
    label: "Authentication",
    hint: "Frontend sign-in and sign-up",
  },
  {
    id: "analytics",
    label: "Analytics",
    hint: "PostHog · requires Authentication and a PostHog connection",
  },
] as const;

export type Feature = (typeof features)[number]["id"];
export const featureIds = features.map(({ id }) => id);
export const featureDependencies: Partial<Record<Feature, readonly Feature[]>> =
  {
    analytics: ["authentication"],
  };

export function resolveFeatures(values: readonly string[]): Feature[] {
  const selected = new Set(values);
  for (const value of selected) {
    if (!featureIds.includes(value as Feature))
      throw new Error(
        `Unknown feature ${JSON.stringify(value)}. Use --features none or --list-options to see valid IDs.`,
      );
    for (const dependency of featureDependencies[value as Feature] ?? [])
      selected.add(dependency);
  }
  return featureIds.filter((id) => selected.has(id));
}
