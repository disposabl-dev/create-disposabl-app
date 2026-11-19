import { useCallback, useEffect, useState } from "react";
import { AppState, FlatList, Text, View } from "react-native";
import { styled, VariableContextProvider } from "nativewind";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { useVideoPlayer, VideoView as ExpoVideoView } from "expo-video";
import { Image as ExpoImage } from "expo-image";
import { useEventListener } from "expo";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  guideLessons,
  type GuideLesson,
} from "../../../../../packages/disposabl-kit/guides";
import { Label, Touch } from "./ui";
import { GuideSocial } from "./guide-social";
import { guideAssetUri } from "./guide-media";

const VideoView = styled(ExpoVideoView);
const Poster = styled(ExpoImage);

function LessonVideo({
  lesson,
  active,
  paused,
  muted,
  setPaused,
  onError,
}: {
  lesson: GuideLesson;
  active: boolean;
  paused: boolean;
  muted: boolean;
  setPaused: React.Dispatch<React.SetStateAction<boolean>>;
  onError: () => void;
}) {
  const player = useVideoPlayer(
    guideAssetUri(lesson.video!.uri),
    (instance) => {
      instance.loop = true;
    },
  );
  useEffect(() => {
    // The Expo player is a native object whose muted property controls playback.
    // eslint-disable-next-line react-hooks/immutability
    player.muted = muted;
  }, [player, muted]);
  useEventListener(player, "statusChange", ({ status }) => {
    if (status === "error") onError();
  });
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        player.pause();
        if (state === "background") setPaused(true);
      } else if (active && !paused) {
        player.play();
      }
    });
    return () => subscription.remove();
  }, [active, paused, player, setPaused]);
  useEffect(() => {
    if (active && !paused && AppState.currentState === "active") player.play();
    else player.pause();
    return () => player.pause();
  }, [active, paused, player]);
  return (
    <>
      <VideoView
        player={player}
        nativeControls={false}
        contentFit="contain"
        className="absolute inset-0 w-full h-full"
      />
      <Touch
        label={paused ? "Play video" : "Pause video"}
        onPress={() => setPaused((value) => !value)}
        className="absolute inset-0 items-center justify-center"
      >
        {paused && (
          <View className="h-[60px] w-[60px] rounded-full bg-black/50 items-center justify-center">
            <MaterialIcons name="play-arrow" size={34} color="white" />
          </View>
        )}
      </Touch>
    </>
  );
}

function LessonPage({
  lesson,
  height,
  selected,
  active,
  paused,
  setPaused,
  expanded,
  toggleDescription,
  muted,
  setMuted,
}: {
  lesson: GuideLesson;
  height: number;
  selected: boolean;
  active: boolean;
  paused: boolean;
  setPaused: React.Dispatch<React.SetStateAction<boolean>>;
  expanded: boolean;
  toggleDescription: () => void;
  muted: boolean;
  setMuted: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const insets = useSafeAreaInsets();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  return (
    <VariableContextProvider
      value={{
        "--layout-height": height,
        "--guide-bottom": Math.max(insets.bottom, 24),
        "--caption-left": Math.max(insets.left + 12, 20),
        "--caption-right": insets.right + 86,
      }}
    >
      <View className="h-[var(--layout-height)] bg-black">
        {lesson.video?.posterUri && (
          <Poster
            source={{ uri: guideAssetUri(lesson.video.posterUri) }}
            contentFit="contain"
            className="absolute inset-0 w-full h-full"
          />
        )}
        {selected && lesson.video && !failed && (
          <LessonVideo
            key={attempt}
            lesson={lesson}
            active={active}
            paused={paused}
            muted={muted}
            setPaused={setPaused}
            onError={() => setFailed(true)}
          />
        )}
        {failed && (
          <View className="absolute inset-0 items-center justify-center">
            <Touch
              label="Video unavailable. Retry"
              onPress={() => {
                setFailed(false);
                setAttempt((value) => value + 1);
              }}
              className="h-[56px] w-[56px] rounded-full bg-white/20 items-center justify-center"
            >
              <MaterialIcons name="refresh" size={28} color="white" />
            </Touch>
          </View>
        )}
        {selected && (
          <>
            <Touch
              label={`${expanded ? "Collapse" : "Expand"} description for ${lesson.title}`}
              onPress={toggleDescription}
              className="absolute bottom-[var(--guide-bottom)] left-[var(--caption-left)] right-[var(--caption-right)] justify-center"
            >
              <View className="max-w-[448px] self-start rounded-[18px] bg-black/70 px-[14px] py-[12px] gap-[4px]">
                <Text className="text-white text-[13px] font-bold">
                  @disposabl
                </Text>
                <Label color="white" variant="label" inline>
                  {lesson.title}
                </Label>
                <Text
                  className="text-white text-[14px] leading-[20px]"
                  numberOfLines={expanded ? undefined : 1}
                >
                  {lesson.summary}
                </Text>
                <Text className="text-white/75 text-[12px]">
                  {expanded ? "Less" : "More"}
                </Text>
              </View>
            </Touch>
            <GuideSocial
              lessonId={lesson.id}
              title={lesson.title}
              muted={muted}
              setMuted={setMuted}
              onShare={() => setPaused(true)}
            />
          </>
        )}
      </View>
    </VariableContextProvider>
  );
}

const legacyLessonIds: Record<string, string> = {
  "first-app": "first-workflow",
  computer: "first-workflow",
  prompts: "first-workflow",
  scope: "first-workflow",
  previews: "safe-release",
  local: "safe-release",
  tools: "mcp",
  release: "web-publish",
};

export function GuideDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const lessonId = legacyLessonIds[id] ?? id;
  const first = Math.max(
    0,
    guideLessons.findIndex((lesson) => lesson.id === lessonId),
  );
  const [index, setIndex] = useState(first);
  const [paused, setPaused] = useState(false);
  const [height, setHeight] = useState(0);
  const [focused, setFocused] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [muted, setMuted] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  return (
    <VariableContextProvider
      value={{
        "--guide-top": Math.max(insets.top, 12),
        "--guide-bottom": Math.max(insets.bottom, 24),
        "--guide-left": Math.max(insets.left + 12, 16),
      }}
    >
      <View
        className="flex-1 bg-black"
        onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
      >
        <Stack.Screen options={{ headerShown: false }} />
        {height > 0 && (
          <FlatList
            key={height}
            data={guideLessons}
            keyExtractor={(lesson) => lesson.id}
            initialScrollIndex={index}
            pagingEnabled
            windowSize={3}
            initialNumToRender={3}
            maxToRenderPerBatch={3}
            getItemLayout={(_, i) => ({
              length: height,
              offset: height * i,
              index: i,
            })}
            scrollEventThrottle={100}
            onScroll={(event) => {
              const next = Math.max(
                0,
                Math.min(
                  guideLessons.length - 1,
                  Math.round(event.nativeEvent.contentOffset.y / height),
                ),
              );
              if (next !== index) {
                setPaused(false);
                setExpanded(false);
                setIndex(next);
              }
            }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item, index: i }) => (
              <LessonPage
                lesson={item}
                height={height}
                selected={i === index}
                active={focused && i === index}
                paused={paused}
                setPaused={setPaused}
                expanded={expanded}
                toggleDescription={() => setExpanded((value) => !value)}
                muted={muted}
                setMuted={setMuted}
              />
            )}
          />
        )}
        <Touch
          label="Close guides"
          onPress={() => router.back()}
          className="absolute top-[var(--guide-top)] left-[var(--guide-left)] h-[48px] w-[48px] rounded-full bg-black/50 items-center justify-center"
        >
          <MaterialIcons name="close" size={24} color="white" />
        </Touch>
      </View>
    </VariableContextProvider>
  );
}
