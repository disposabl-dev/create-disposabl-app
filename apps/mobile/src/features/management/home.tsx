import { useConvexAuth, useMutation } from "convex/react";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { api } from "../../../../../packages/backend/convex/_generated/api";
import {
  platforms,
  resolvePlatforms,
  type Platform,
} from "@disposabl/disposabl-kit/platforms";
import { authenticationEnabled } from "@disposabl/disposabl-kit/features";
import { useTheme } from "../../../../../packages/disposabl-kit/mobile/design/use-theme";
import { ConnectionGate } from "../studio/connections";
import { examples } from "../studio/data";
import { MessageComposer } from "../studio/message-composer";
import { Action, Screen, Label, Touch } from "../studio/ui";
import { ErrorBoundary } from "./ui";

export function ManagementHome() {
  return (
    <ErrorBoundary>
      <Screen title="Create app">
        {authenticationEnabled ? (
          <ComposeEntry />
        ) : (
          <Label>App creation requires authentication.</Label>
        )}
      </Screen>
    </ErrorBoundary>
  );
}

function ComposeEntry() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { exampleSlug } = useLocalSearchParams<{ exampleSlug?: string }>();
  if (isLoading)
    return <ActivityIndicator accessibilityLabel="Loading session" />;
  if (!isAuthenticated)
    return (
      <View style={{ gap: 24 }}>
        <Label variant="title">Let’s make your idea real.</Label>
        <Label>Sign in to create an app in your own accounts.</Label>
        <Action
          label="Sign in to create"
          onPress={() =>
            router.push({
              pathname: "/(auth)/login",
              params: {
                returnTo: exampleSlug
                  ? `/compose?exampleSlug=${encodeURIComponent(exampleSlug)}`
                  : "/compose",
              },
            })
          }
        />
      </View>
    );
  return (
    <ConnectionGate>
      <Composer />
    </ConnectionGate>
  );
}

function Composer() {
  const { exampleSlug } = useLocalSearchParams<{ exampleSlug?: string }>();
  const example = examples.find((app) => app.slug === exampleSlug);
  const [prompt, setPrompt] = useState(example?.prompt ?? "");
  const [selected, setSelected] = useState<Platform[]>(
    example?.targets ?? ["web"],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const send = useMutation(api.agent.index.sendMessage);
  const c = useTheme();
  async function submit() {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await send({
        prompt: prompt.trim(),
        platforms: resolvePlatforms(selected),
        features: ["authentication"],
      });
      router.replace({
        pathname: "/(authenticated)/apps/[appId]",
        params: { appId: result.appId },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send your idea.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 28 }}>
      <Label variant="display">What will you build?</Label>
      <Label color={c.mutedForeground}>
        A thought, a tool, a little corner of the internet.
      </Label>
      <MessageComposer
        value={prompt}
        onChange={setPrompt}
        onSend={() => void submit()}
        disabled={busy}
        sending={busy}
      />
      <Label variant="heading">Make it available on</Label>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {platforms.map((platform) => (
          <Touch
            key={platform.id}
            label={platform.label}
            selected={selected.includes(platform.id)}
            onPress={() => {
              if (platform.id === "web") return;
              setSelected((current) =>
                current.includes(platform.id)
                  ? current.filter((p) => p !== platform.id)
                  : [...current, platform.id],
              );
            }}
            style={{
              borderRadius: 24,
              paddingHorizontal: 18,
              paddingVertical: 14,
              backgroundColor: selected.includes(platform.id)
                ? c.foreground
                : c.card,
            }}
          >
            <Text
              style={{
                fontSize: 15,
                color: selected.includes(platform.id)
                  ? c.background
                  : c.foreground,
              }}
            >
              {platform.label}
            </Text>
          </Touch>
        ))}
      </View>
      <Label variant="caption" color={c.mutedForeground}>
        Every app includes a website for essentials and access.
      </Label>
      {!!error && (
        <Text accessibilityRole="alert" style={{ color: c.destructive }}>
          {error}
        </Text>
      )}
    </View>
  );
}
