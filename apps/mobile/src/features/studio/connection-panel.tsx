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
}: {
  connections?: ConnectionSummary;
  onConnect: () => void;
  onContinue: () => void;
  onProvider?: (provider: "github" | "convex" | "expo") => void;
  onManage?: () => void;
  busy?: boolean;
}) {
  const c = useTheme();
  if (!connections)
    return <ActivityIndicator accessibilityLabel="Loading connections" />;
  const completed = Number(!!connections.github) + Number(!!connections.convex);
  const rows = [
    {
      id: "github",
      name: "GitHub",
      detail: "A home for your code",
      account: connections.github?.owner,
    },
    {
      id: "convex",
      name: "Convex",
      detail: "Your app’s data and backend",
      account: connections.convex?.name,
    },
    {
      id: "expo",
      name: "Expo",
      detail: "For iOS and Android apps",
      account: connections.expo?.name,
    },
  ] as const;
  return (
    <View className="gap-[28px]">
      <View className="gap-[12px]">
        <Label variant="eyebrow" color={c.primaryText}>
          {connections.ready ? "READY TO CREATE" : "YOUR WORKSPACE"}
        </Label>
        <Label variant="display">
          {connections.ready
            ? "You’re ready to build."
            : "Your idea.\nYour accounts."}
        </Label>
        <Label color={c.mutedForeground}>
          Connect once. Every app you create stays yours.
        </Label>
      </View>
      <View className="gap-[10px]">
        <View className="flex-row gap-[6px]">
          {[0, 1].map((step) => (
            <View
              key={step}
              className={`h-[4px] flex-1 rounded-[4px] ${completed > step ? "bg-primary-text" : "bg-border"}`}
            />
          ))}
        </View>
        <Label
          variant="caption"
          color={c.mutedForeground}
        >{`${completed} of 2 essentials connected`}</Label>
      </View>
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
                  `${row.id === "expo" ? "Optional" : "Required"} · ${row.detail}`}
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
      {!connections.ready && (
        <Label variant="caption" center color={c.mutedForeground}>
          Secure setup opens in your browser.
        </Label>
      )}
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
