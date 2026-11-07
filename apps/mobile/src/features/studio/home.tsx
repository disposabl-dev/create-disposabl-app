import { ConnectionNotice } from "./connections";
import { FlatList, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTheme } from "../../../../../packages/disposabl-kit/mobile/design/use-theme";
import { AppCollection } from "./catalogue";
import { examples as apps } from "./data";
import { Screen, Label, Touch, Icon } from "./ui";
export default function HomeScreen() {
  const router = useRouter();
  const c = useTheme();
  const { width } = useWindowDimensions();
  const [shelfWidth, setShelfWidth] = useState(width - 48);
  const featureWidth = Math.max(180, Math.min(shelfWidth - 16, 560));
  const features = [
    {
      title: "What will you build?",
      line: "Start with your idea.",
      action: "Create app",
      route: "/compose" as const,
      color: c.card,
    },
    {
      title: "A little help to get started",
      line: "APIs, agents, and your first app.",
      action: "Explore guides",
      route: "/(tabs)/(guides)/guides" as const,
      color: c.muted,
    },
  ];
  return (
    <Screen title="Discover">
      <ConnectionNotice />
      <FlatList
        horizontal
        onLayout={(event) => setShelfWidth(event.nativeEvent.layout.width)}
        snapToInterval={featureWidth + 12}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        data={features}
        keyExtractor={(i) => i.title}
        contentContainerStyle={{ gap: 12 }}
        renderItem={({ item }) => (
          <Touch
            label={item.action}
            onPress={() => router.push(item.route)}
            style={{
              width: featureWidth,
              padding: 28,
              borderRadius: 28,
              gap: 20,
              backgroundColor: item.color,
            }}
          >
            <Label variant="title">{item.title}</Label>
            <Label color={c.mutedForeground}>{item.line}</Label>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              <View style={{ flex: 1 }}>
                <Label variant="label">{item.action}</Label>
              </View>
              <Icon name="arrow" size={18} />
            </View>
          </Touch>
        )}
      />
      <AppCollection
        title="Make it yours"
        apps={apps.filter((a) => a.visibility === "public")}
      />
      <AppCollection
        title="Small sites, big possibilities"
        apps={apps.filter(
          (a) => a.visibility === "public" && a.targets.includes("web"),
        )}
      />
    </Screen>
  );
}
