import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useTheme } from "../../../../../packages/disposabl-kit/mobile/design/use-theme";

export function ResponseProgress({
  startedAt,
  finishedAt,
  running,
}: {
  startedAt?: number;
  finishedAt?: number;
  running: boolean;
}) {
  const c = useTheme();
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
    <View style={{ gap: 12, paddingBottom: 8 }}>
      <Text style={{ color: c.mutedForeground, fontSize: 13 }}>
        {running ? "Working" : "Worked"}
        {duration ? ` for ${duration}` : "…"}
      </Text>
      <View style={{ height: 1, backgroundColor: c.border }} />
    </View>
  );
}
