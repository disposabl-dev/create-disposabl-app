import { styled, VariableContextProvider } from "nativewind";
import { Image } from "expo-image";
import { ScrollView, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import {
  guideJourneys,
  guideLessons,
  type GuideJourney,
  type GuideLesson,
} from "../../../../../packages/disposabl-kit/guides";
import { GuideCover } from "./guide-art";
import { Screen, Label, Touch } from "./ui";
import { captureProductAction } from "../product-telemetry";
import { guideAssetUri } from "./guide-media";

const PosterImage = styled(Image);

function Poster({
  lesson,
  height,
  index,
}: {
  lesson: GuideLesson;
  height: number;
  index: number;
}) {
  return (
    <VariableContextProvider value={{ "--poster-height": height }}>
      <View className="h-[var(--poster-height)] w-full rounded-[24px] overflow-hidden bg-card">
        {lesson.video?.posterUri ? (
          <PosterImage
            source={{ uri: guideAssetUri(lesson.video.posterUri) }}
            contentFit="cover"
            contentPosition="top"
            className="w-full h-full"
          />
        ) : (
          <GuideCover title="" index={index} height={height} />
        )}
      </View>
    </VariableContextProvider>
  );
}

function LessonCard({ lesson, index }: { lesson: GuideLesson; index: number }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(200, width * 0.46);
  return (
    <VariableContextProvider value={{ "--layout-width": cardWidth }}>
      <Touch
        label={lesson.video ? `Watch ${lesson.title}` : `About ${lesson.title}`}
        onPress={() => {
          captureProductAction("open_guide");
          router.push({ pathname: "/guide-detail", params: { id: lesson.id } });
        }}
        className="w-[var(--layout-width)] gap-[10px]"
      >
        <Poster lesson={lesson} index={index} height={cardWidth * 1.5} />
        <Label variant="label">{lesson.title}</Label>
      </Touch>
    </VariableContextProvider>
  );
}

function Journey({
  journey,
  featuredId,
}: {
  journey: GuideJourney;
  featuredId?: string;
}) {
  const lessons = journey.lessonIds
    .filter((id) => id !== featuredId)
    .map((id) => guideLessons.find((lesson) => lesson.id === id))
    .filter((lesson): lesson is GuideLesson => Boolean(lesson));
  if (!lessons.length) return null;
  return (
    <View className="gap-[18px]">
      <Label variant="title">{journey.title}</Label>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-[14px] pb-[4px]"
      >
        {lessons.map((lesson) => (
          <LessonCard
            key={lesson.id}
            lesson={lesson}
            index={guideLessons.indexOf(lesson)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

export default function GuidesScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const welcomeJourney = guideJourneys.find(
    (journey) => journey.kind === "welcome",
  );
  const welcome = guideLessons.find(
    (lesson) => lesson.id === welcomeJourney?.lessonIds[0],
  );
  return (
    <Screen title="Guides" contentClassName="gap-[36px]">
      {welcome && (
        <Touch
          label={
            welcome.video ? `Watch ${welcome.title}` : `About ${welcome.title}`
          }
          onPress={() => {
            captureProductAction("open_guide");
            router.push({
              pathname: "/guide-detail",
              params: { id: welcome.id },
            });
          }}
          className="gap-[14px]"
        >
          <Poster
            lesson={welcome}
            index={3}
            height={Math.min(460, width * 1.2, height * 0.55)}
          />
          <Label variant="heading">{welcome.title}</Label>
        </Touch>
      )}
      {guideJourneys.map((journey) => (
        <Journey
          key={journey.id}
          journey={journey}
          featuredId={journey.kind === "welcome" ? welcome?.id : undefined}
        />
      ))}
    </Screen>
  );
}

export { GuideDetailScreen } from "./guide-player";
