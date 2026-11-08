import { VariableContextProvider } from "nativewind";
import { FlatList, View, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { AppArtwork } from "./art";
import { examples, type Example } from "./data";
import { Action, Label, Screen, TargetBadges, Touch } from "./ui";
import { useTheme } from "../../../../../packages/disposabl-kit/mobile/design/use-theme";

export function AppCollection({
  title,
  apps,
}: {
  title: string;
  apps: Example[];
}) {
  const { width } = useWindowDimensions();
  return (
    <View className="gap-[16px]">
      <Label variant="heading">{title}</Label>
      <FlatList
        horizontal
        data={apps}
        keyExtractor={(app) => app.slug}
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-[16px]"
        renderItem={({ item }) => (
          <VariableContextProvider
            value={{ "--layout-width": Math.min(width * 0.72, 300) ?? "auto" }}
          >
            <Touch
              label={`Explore ${item.name}`}
              onPress={() =>
                router.push({
                  pathname: "/example",
                  params: { slug: item.slug },
                })
              }
              className="w-[var(--layout-width)] gap-[10px]"
            >
              <AppArtwork app={item} compact />
              <Label variant="label">{item.name}</Label>
              <TargetBadges targets={item.targets} />
            </Touch>
          </VariableContextProvider>
        )}
      />
    </View>
  );
}

export function ExampleScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const app = examples.find((example) => example.slug === slug);
  const c = useTheme();
  if (!app)
    return (
      <Screen title="Inspiration">
        <Label>This example is unavailable.</Label>
      </Screen>
    );
  return (
    <Screen title={app.name}>
      <AppArtwork app={app} />
      <View className="gap-[12px]">
        <Label variant="title">{app.name}</Label>
        <Label>{app.about ?? app.line}</Label>
        <TargetBadges targets={app.targets} />
      </View>
      <Label variant="caption" color={c.mutedForeground}>
        Design inspiration. This example is not a published app.
      </Label>
      <Action
        label="Make it yours"
        onPress={() =>
          router.push({
            pathname: "/compose",
            params: { exampleSlug: app.slug },
          })
        }
      />
    </Screen>
  );
}
