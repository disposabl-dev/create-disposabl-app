import { ActivityIndicator, Pressable, Text, View } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useTheme } from "../../../../../packages/disposabl-kit/mobile/design/use-theme";
import { Label, Icon } from "./ui";

export type ConnectionSummary = {
  github: { owner: string } | null;
  convex: { name: string } | null;
  expo: { name: string } | null;
  ready: boolean;
};

export function ProviderMark({
  provider,
}: {
  provider: "github" | "convex" | "expo";
}) {
  const c = useTheme();
  return (
    <View className="w-[48px] h-[48px] rounded-[16px] bg-muted items-center justify-center">
      {provider === "github" ? (
        <FontAwesome name="github" size={27} color={c.foreground} />
      ) : (
        <MaterialIcons
          name={provider === "convex" ? "storage" : "phone-iphone"}
          size={25}
          color={c.foreground}
        />
      )}
    </View>
  );
}

export function ConnectionPanel({
  connections,
  onConnect,
  onContinue,
  onProvider,
  onManage,
  busy = false,
  expoRequired = false,
}: {
  connections?: ConnectionSummary;
  onConnect: () => void;
  onContinue: () => void;
  onProvider?: (provider: "github" | "convex" | "expo") => void;
  onManage?: () => void;
  busy?: boolean;
  expoRequired?: boolean;
}) {
  const c = useTheme();
  if (!connections)
    return <ActivityIndicator accessibilityLabel="Loading connections" />;
  const rows = [
    {
      id: "github",
      name: "GitHub",
      account: connections.github?.owner,
    },
    {
      id: "convex",
      name: "Convex",
      account: connections.convex?.name,
    },
    {
      id: "expo",
      name: "Expo",
      account: connections.expo?.name,
    },
  ] as const;
  return (
    <View className="gap-[28px]">
      <Label color={c.mutedForeground}>
        Connect once. Every app you create stays yours.
      </Label>
      <View className="bg-card rounded-[24px] px-[20px]">
        {rows.map((row, index) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${row.account ? "Change" : "Connect"} ${row.name}`}
            disabled={busy || !onProvider}
            onPress={() => onProvider?.(row.id)}
            key={row.id}
            className={`flex-row items-center gap-[16px] border-border py-[20px] ${index < rows.length - 1 ? "border-b" : ""}`}
          >
            <ProviderMark provider={row.id} />
            <View className="flex-1 gap-[4px]">
              <Label variant="heading">{row.name}</Label>
              <Label variant="caption" color={c.mutedForeground}>
                {row.account ??
                  (row.id === "expo" && !expoRequired
                    ? "Optional"
                    : "Required")}
              </Label>
            </View>
            {row.account ? (
              <Icon name="check" size={19} color={c.primaryText} />
            ) : null}
          </Pressable>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          connections.ready ? "Start creating" : "Connect accounts"
        }
        accessibilityState={{ disabled: busy, busy }}
        disabled={busy}
        onPress={connections.ready ? onContinue : onConnect}
        className={`min-h-[56px] flex-row items-center justify-center gap-[12px] rounded-[28px] bg-foreground px-[24px] py-[16px] active:opacity-[0.65] ${busy ? "opacity-[0.65]" : ""}`}
      >
        {busy ? <ActivityIndicator color={c.background} /> : null}
        <Text className="text-background text-[17px] font-semibold shrink text-center">
          {connections.ready ? "Start creating" : "Connect accounts"}
        </Text>
        <Icon name="arrow" color={c.background} size={18} />
      </Pressable>
      {connections.ready && (
        <Pressable
          accessibilityRole="button"
          onPress={onManage ?? onConnect}
          disabled={busy}
          className="p-[12px]"
        >
          <Text className="text-center text-muted-foreground text-[15px]">
            Manage connections
          </Text>
        </Pressable>
      )}
    </View>
  );
}
