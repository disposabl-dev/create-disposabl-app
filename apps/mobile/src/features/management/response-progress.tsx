import { useEffect, useState } from "react";
import { Text, View } from "react-native";

export function ResponseProgress({
  startedAt,
  finishedAt,
  running,
}: {
  startedAt?: number;
  finishedAt?: number;
  running: boolean;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  if (!startedAt && !running) return null;
  const seconds = startedAt
    ? Math.max(
        0,
        Math.floor(
          ((running ? now : (finishedAt ?? startedAt)) - startedAt) / 1000,
        ),
      )
    : null;
  const duration =
    seconds === null
      ? ""
      : seconds < 60
        ? `${seconds}s`
        : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return (
    <View className="gap-[12px] pb-[8px]">
      <Text className="text-muted-foreground text-[13px]">
        {running ? "Working" : "Worked"}
        {duration ? ` for ${duration}` : "…"}
      </Text>
      <View className="h-[1px] bg-border" />
    </View>
  );
}
