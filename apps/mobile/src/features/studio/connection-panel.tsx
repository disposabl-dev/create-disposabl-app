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
    <View
      style={{
        width: 48,
        height: 48,
        borderRadius: 16,
        backgroundColor: c.muted,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
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
    <View style={{ gap: 28 }}>
      <View style={{ gap: 12 }}>
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
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {[0, 1].map((step) => (
            <View
              key={step}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                backgroundColor: completed > step ? c.primaryText : c.border,
              }}
            />
          ))}
        </View>
        <Label
          variant="caption"
          color={c.mutedForeground}
        >{`${completed} of 2 essentials connected`}</Label>
      </View>
      <View
        style={{
          backgroundColor: c.card,
          borderRadius: 24,
          paddingHorizontal: 20,
        }}
      >
        {rows.map((row, index) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${row.account ? "Change" : "Connect"} ${row.name}`}
            disabled={busy || !onProvider}
            onPress={() => onProvider?.(row.id)}
            key={row.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 16,
              paddingVertical: 20,
              borderBottomWidth: index < rows.length - 1 ? 1 : 0,
              borderBottomColor: c.border,
            }}
          >
            <ProviderMark provider={row.id} />
            <View style={{ flex: 1, gap: 4 }}>
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
        style={({ pressed }) => ({
          minHeight: 56,
          borderRadius: 28,
          paddingHorizontal: 24,
          paddingVertical: 16,
          backgroundColor: c.foreground,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          opacity: pressed || busy ? 0.65 : 1,
        })}
      >
        {busy ? <ActivityIndicator color={c.background} /> : null}
        <Text
          style={{
            color: c.background,
            fontSize: 17,
            fontWeight: "600",
            flexShrink: 1,
            textAlign: "center",
          }}
        >
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
          style={{ padding: 12 }}
        >
          <Text
            style={{
              textAlign: "center",
              color: c.mutedForeground,
              fontSize: 15,
            }}
          >
            Manage connections
          </Text>
        </Pressable>
      )}
    </View>
  );
}
