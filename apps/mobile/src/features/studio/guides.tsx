import { VariableContextProvider } from "nativewind";
import { FlatList, ScrollView, View, useWindowDimensions } from "react-native";
import { useRef, useState } from "react";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useTheme } from "../../../../../packages/disposabl-kit/mobile/design/use-theme";
import { guides, guideSections, type Guide } from "./data";
import { GuideCover } from "./guide-art";
import { Screen, Label, Touch, Icon, Action, GlassSurface } from "./ui";
import { captureProductAction } from "../product-telemetry";

const coverTitles: Record<string, string> = {
  api: "API",
  mcp: "MCP",
  cli: "CLI",
  welcome: "Ideas into\napps.",
  "first-app": "Your first\ncreation.",
  computer: "Make the\nconnection.",
  prompts: "A better\nbrief.",
  scope: "One thing\nat a time.",
  previews: "Room to\nexperiment.",
  local: "In your\nelement.",
  tools: "Built for\nagents.",
  release: "Ready for\nthe world.",
};
function Shelf({
  title,
  lessons,
  wide = false,
}: {
  title: string;
  lessons: Guide[];
  wide?: boolean;
}) {
  const c = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(wide ? 258 : 184, width * (wide ? 0.68 : 0.46));
  return (
    <View className="gap-[18px]">
      <View className="flex-row items-center gap-[12px]">
        <View className="flex-1">
          <Label variant="title">{title}</Label>
        </View>
        <Label
          inline
          variant="caption"
          color={c.mutedForeground}
        >{`${lessons.length} lessons`}</Label>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-[18px] pb-[4px]"
      >
        {lessons.map((guide) => (
          <VariableContextProvider
            key={guide.id}
            value={{ "--layout-width": cardWidth ?? "auto" }}
          >
            <Touch
              key={guide.id}
              label={`Read ${guide.title}`}
              onPress={() => {
                captureProductAction("open_guide");
                router.push({
                  pathname: "/guide-detail",
                  params: { id: guide.id },
                });
              }}
              className="w-[var(--layout-width)] gap-[12px]"
            >
              <GuideCover
                title={coverTitles[guide.id] ?? guide.title}
                index={guides.indexOf(guide)}
                height={wide ? 182 : cardWidth * 1.16}
              />
              <View className="flex-row gap-[10px] items-start">
                <View className="flex-1">
                  <Label variant="label">{guide.title}</Label>
                </View>
                <Icon name="book" size={14} color={c.mutedForeground} />
              </View>
            </Touch>
          </VariableContextProvider>
        ))}
      </ScrollView>
    </View>
  );
}
export default function GuidesScreen() {
  const c = useTheme();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  return (
    <Screen title="Guides" contentClassName="gap-[34px]">
      <Touch
        label="Read Meet Disposabl"
        onPress={() => {
          captureProductAction("open_guide");
          router.push({ pathname: "/guide-detail", params: { id: "welcome" } });
        }}
        className="gap-[16px]"
      >
        <View>
          <GuideCover
            title={"Your ideas.\nMade real."}
            index={3}
            height={Math.min(260, width * 0.6, height * 0.4)}
            featured
          />
          <View className="absolute left-[24px] bottom-[24px]">
            <GlassSurface className="w-[54px] h-[54px] rounded-[27px] justify-center items-center">
              <Icon name="book" size={22} color={c.foreground} />
            </GlassSurface>
          </View>
        </View>
        <View className="gap-[6px]">
          <Label variant="heading">Meet Disposabl</Label>
        </View>
      </Touch>
      <Shelf
        title="Fundamentals"
        lessons={guides.filter((g) => g.section === "Fundamentals")}
      />
      <Shelf
        title="Introduction"
        lessons={guides.filter((g) => g.section === "Introduction")}
        wide
      />
      <View className="gap-[20px]">
        <Label variant="title">Mastery</Label>
        {guideSections
          .filter((section) => section.startsWith("Mastery"))
          .map((section, i) => {
            const lessons = guides.filter((g) => g.section === section);
            return (
              <Touch
                key={section}
                label={`Explore ${section.replace("Mastery · ", "")}`}
                onPress={() => {
                  captureProductAction("open_guide");
                  router.push({
                    pathname: "/guide-detail",
                    params: { id: lessons[0]!.id },
                  });
                }}
                className="flex-row gap-[18px] items-center py-[8px]"
              >
                <View className="w-[100px]">
                  <GuideCover
                    title={String(i + 1).padStart(2, "0")}
                    index={i + 1}
                    height={116}
                  />
                </View>
                <View className="flex-1 gap-[8px]">
                  <Label variant="heading">
                    {section.replace("Mastery · ", "")}
                  </Label>
                  <Label
                    variant="caption"
                    color={c.mutedForeground}
                  >{`${lessons.length} ${lessons.length === 1 ? "lesson" : "lessons"}`}</Label>
                </View>
                <Icon name="chevron" size={16} color={c.mutedForeground} />
              </Touch>
            );
          })}
      </View>
    </Screen>
  );
}
export function GuideDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const first = Math.max(
    0,
    guides.findIndex((g) => g.id === id),
  );
  const [index, setIndex] = useState(first);
  const [height, setHeight] = useState(0);
  const list = useRef<FlatList<Guide>>(null);
  const c = useTheme();
  function move(next: number) {
    if (next < 0 || next >= guides.length) return;
    captureProductAction("open_guide");
    list.current?.scrollToIndex({ index: next });
    setIndex(next);
  }
  return (
    <View
      className="flex-1 bg-background"
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
    >
      <Stack.Screen options={{ title: guides[index]!.section }} />
      {height > 0 && (
        <FlatList
          ref={list}
          data={guides}
          keyExtractor={(g) => g.id}
          initialScrollIndex={first}
          pagingEnabled
          getItemLayout={(_, i) => ({
            length: height,
            offset: height * i,
            index: i,
          })}
          onMomentumScrollEnd={(e) =>
            setIndex(
              Math.max(
                0,
                Math.min(
                  guides.length - 1,
                  Math.round(e.nativeEvent.contentOffset.y / height),
                ),
              ),
            )
          }
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index: i }) => (
            <VariableContextProvider value={{ "--layout-height": height }}>
              <ScrollView
                className="h-[var(--layout-height)]"
                contentContainerClassName="p-[24px] gap-[24px] pb-[36px]"
              >
                <Label variant="title">{item.title}</Label>
                <View className="rounded-[24px] overflow-hidden">
                  <GuideCover
                    title={coverTitles[item.id] ?? item.title}
                    index={i}
                    height={280}
                    featured
                  />
                  <View className="p-[20px] bg-card flex-row gap-[12px] items-center">
                    <Icon name="book" />
                    <View className="flex-1">
                      <Label variant="label">Guide</Label>
                    </View>
                  </View>
                </View>
                <Label>{item.body}</Label>
                <View className="flex-row justify-between gap-[12px]">
                  <Action
                    compact
                    label="Previous"
                    secondary
                    disabled={i === 0}
                    onPress={() => move(i - 1)}
                  />
                  <Action
                    compact
                    label="Next"
                    secondary
                    disabled={i === guides.length - 1}
                    onPress={() => move(i + 1)}
                  />
                </View>
                <Label variant="caption" color={c.mutedForeground}>
                  Swipe up for the next lesson. Lessons continue through each
                  section in order.
                </Label>
              </ScrollView>
            </VariableContextProvider>
          )}
        />
      )}
    </View>
  );
}
