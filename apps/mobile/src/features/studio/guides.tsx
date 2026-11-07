import { FlatList, ScrollView, View, useWindowDimensions } from "react-native";
import { useRef, useState } from "react";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useTheme } from "../../../../../packages/disposabl-kit/mobile/design/use-theme";
import { guides, guideSections, type Guide } from "./data";
import { GuideCover } from "./guide-art";
import { Screen, Label, Touch, Icon, Action, GlassSurface } from "./ui";

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
    <View style={{ gap: 18 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1 }}>
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
        contentContainerStyle={{ gap: 18, paddingBottom: 4 }}
      >
        {lessons.map((guide) => (
          <Touch
            key={guide.id}
            label={`Read ${guide.title}`}
            onPress={() =>
              router.push({
                pathname: "/guide-detail",
                params: { id: guide.id },
              })
            }
            style={{ width: cardWidth, gap: 12 }}
          >
            <GuideCover
              title={coverTitles[guide.id] ?? guide.title}
              index={guides.indexOf(guide)}
              height={wide ? 182 : cardWidth * 1.16}
            />
            <View
              style={{
                flexDirection: "row",
                gap: 10,
                alignItems: "flex-start",
              }}
            >
              <View style={{ flex: 1 }}>
                <Label variant="label">{guide.title}</Label>
              </View>
              <Icon name="book" size={14} color={c.mutedForeground} />
            </View>
          </Touch>
        ))}
      </ScrollView>
    </View>
  );
}
export default function GuidesScreen() {
  const c = useTheme();
  const router = useRouter();
  return (
    <Screen title="Guides" style={{ gap: 34 }}>
      <Touch
        label="Read Meet Disposabl"
        onPress={() =>
          router.push({ pathname: "/guide-detail", params: { id: "welcome" } })
        }
        style={{ gap: 16 }}
      >
        <View>
          <GuideCover
            title={"Your ideas.\nMade real."}
            index={3}
            height={300}
            featured
          />
          <View style={{ position: "absolute", left: 24, bottom: 24 }}>
            <GlassSurface
              style={{
                width: 54,
                height: 54,
                borderRadius: 27,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Icon name="book" size={22} color={c.foreground} />
            </GlassSurface>
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <Label variant="heading">Meet Disposabl</Label>
          <Label color={c.mutedForeground}>
            A place to begin. An idea to make your own.
          </Label>
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
      <View style={{ gap: 20 }}>
        <Label variant="title">Mastery</Label>
        <Label color={c.mutedForeground}>Take your next idea further.</Label>
        {guideSections
          .filter((section) => section.startsWith("Mastery"))
          .map((section, i) => {
            const lessons = guides.filter((g) => g.section === section);
            return (
              <Touch
                key={section}
                label={`Explore ${section.replace("Mastery · ", "")}`}
                onPress={() =>
                  router.push({
                    pathname: "/guide-detail",
                    params: { id: lessons[0]!.id },
                  })
                }
                style={{
                  flexDirection: "row",
                  gap: 18,
                  alignItems: "center",
                  paddingVertical: 8,
                }}
              >
                <View style={{ width: 100 }}>
                  <GuideCover
                    title={String(i + 1).padStart(2, "0")}
                    index={i + 1}
                    height={116}
                  />
                </View>
                <View style={{ flex: 1, gap: 8 }}>
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
    list.current?.scrollToIndex({ index: next });
    setIndex(next);
  }
  return (
    <View
      style={{ flex: 1, backgroundColor: c.background }}
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
            <ScrollView
              style={{ height }}
              contentContainerStyle={{
                padding: 24,
                gap: 24,
                paddingBottom: 36,
              }}
            >
              <Label variant="title">{item.title}</Label>
              <View style={{ borderRadius: 24, overflow: "hidden" }}>
                <GuideCover
                  title={coverTitles[item.id] ?? item.title}
                  index={i}
                  height={280}
                  featured
                />
                <View
                  style={{
                    padding: 20,
                    backgroundColor: c.card,
                    flexDirection: "row",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  <Icon name="book" />
                  <View style={{ flex: 1 }}>
                    <Label variant="label">Guide</Label>
                  </View>
                </View>
              </View>
              <Label>{item.body}</Label>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
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
          )}
        />
      )}
    </View>
  );
}
