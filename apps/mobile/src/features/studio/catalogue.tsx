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
    <View style={{ gap: 16 }}>
      <Label variant="heading">{title}</Label>
      <FlatList
        horizontal
        data={apps}
        keyExtractor={(app) => app.slug}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 16 }}
        renderItem={({ item }) => (
          <Touch
            label={`Explore ${item.name}`}
            onPress={() =>
              router.push({ pathname: "/example", params: { slug: item.slug } })
            }
            style={{ width: Math.min(width * 0.72, 300), gap: 10 }}
          >
            <AppArtwork app={item} compact />
            <Label variant="label">{item.name}</Label>
            <TargetBadges targets={item.targets} />
          </Touch>
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
      <View style={{ gap: 12 }}>
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
