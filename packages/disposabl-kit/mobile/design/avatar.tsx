import { useState } from "react";
import { Image, View } from "react-native";
import { ThemedText } from "./themed-text";

export function Avatar({
  name,
  source,
}: {
  name: string;
  source?: string | null;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const initials = name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return source && failedSource !== source ? (
    <Image
      source={{ uri: source }}
      style={{ width: 92, height: 92, borderRadius: 46 }}
      accessibilityLabel={`${name}'s profile picture`}
      onError={() => setFailedSource(source)}
    />
  ) : (
    <View
      className="h-[92px] w-[92px] items-center justify-center rounded-full bg-primary"
      accessibilityRole="image"
      accessibilityLabel={`${name}'s profile picture`}
    >
      <ThemedText type="subtitle" themeColor="primaryForeground">
        {initials || "?"}
      </ThemedText>
    </View>
  );
}
