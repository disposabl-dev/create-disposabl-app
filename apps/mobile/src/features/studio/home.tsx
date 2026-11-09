import { VariableContextProvider } from "nativewind";
import { FlatList, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTheme } from "../../../../../packages/disposabl-kit/mobile/design/use-theme";
import { AppCollection } from "./catalogue";
import { examples as apps } from "./data";
import { Screen, Label, Touch, Icon } from "./ui";
import { captureProductAction } from "../product-telemetry";
export default function HomeScreen() {
  const router = useRouter();
  const c = useTheme();
  const { width } = useWindowDimensions();
  const [shelfWidth, setShelfWidth] = useState(width - 48);
  const featureWidth = Math.max(180, Math.min(shelfWidth - 16, 560));
  const features = [
    {
      title: "What will you build?",
      action: "Create app",
      route: "/compose" as const,
      color: c.card,
    },
    {
      title: "Find your next idea",
      action: "Explore guides",
      route: "/(tabs)/(guides)/guides" as const,
      color: c.muted,
    },
  ];
  return (
    <Screen title="Discover">
      <FlatList
        horizontal
        onLayout={(event) => setShelfWidth(event.nativeEvent.layout.width)}
        snapToInterval={featureWidth + 12}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        data={features}
        keyExtractor={(i) => i.title}
        contentContainerClassName="gap-[12px]"
        renderItem={({ item }) => (
          <VariableContextProvider
            value={{
              "--layout-width": featureWidth ?? "auto",
              "--layout-background-color": item.color,
            }}
          >
            <Touch
              label={item.action}
              onPress={() => {
                if (item.route === "/compose")
                  captureProductAction("open_create");
                router.push(item.route);
              }}
              className="w-[var(--layout-width)] p-[28px] rounded-[28px] gap-[20px] bg-[var(--layout-background-color)]"
            >
              <Label variant="title">{item.title}</Label>
              <View className="flex-row items-center gap-[12px]">
                <View className="flex-1">
                  <Label variant="label">{item.action}</Label>
                </View>
                <Icon name="arrow" size={18} />
              </View>
            </Touch>
          </VariableContextProvider>
        )}
      />
      <AppCollection
        title="Make it yours"
        apps={apps.filter((a) => a.visibility === "public")}
      />
    </Screen>
  );
}
