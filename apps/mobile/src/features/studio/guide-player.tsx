import { useCallback, useEffect, useState } from "react";
import { AppState, FlatList, Modal, View } from "react-native";
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
import { useTheme } from "../../../../../packages/disposabl-kit/mobile/design/use-theme";
import { guideAssetUri } from "./guide-media";

const VideoView = styled(ExpoVideoView);
const Poster = styled(ExpoImage);

function LessonVideo({
  lesson,
  active,
  paused,
  setPaused,
  onError,
}: {
  lesson: GuideLesson;
  active: boolean;
  paused: boolean;
  setPaused: React.Dispatch<React.SetStateAction<boolean>>;
  onError: () => void;
}) {
  const player = useVideoPlayer(
    guideAssetUri(lesson.video!.uri),
    (instance) => {
      instance.loop = true;
    },
  );
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
  openDescription,
}: {
  lesson: GuideLesson;
  height: number;
  selected: boolean;
  active: boolean;
  paused: boolean;
  setPaused: React.Dispatch<React.SetStateAction<boolean>>;
  openDescription: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  return (
    <VariableContextProvider
      value={{
        "--layout-height": height,
        "--guide-bottom": Math.max(insets.bottom, 24),
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
        <Touch
          label={`Show description for ${lesson.title}`}
          onPress={openDescription}
          className="absolute bottom-[var(--guide-bottom)] left-[20px] right-[20px] justify-center"
        >
          <View className="self-start rounded-[16px] bg-black/60 px-[14px] py-[10px]">
            <Label color="white" variant="label" inline>
              {lesson.title}
            </Label>
          </View>
        </Touch>
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
  const c = useTheme();
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
  const [description, setDescription] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const current = guideLessons[index];
  return (
    <VariableContextProvider
      value={{
        "--guide-top": Math.max(insets.top, 12),
        "--guide-bottom": Math.max(insets.bottom, 24),
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
                setIndex(next);
              }
            }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item, index: i }) => (
              <LessonPage
                lesson={item}
                height={height}
                selected={i === index}
                active={focused && i === index && !description}
                paused={paused}
                setPaused={setPaused}
                openDescription={() => {
                  if (i === index) setDescription(true);
                }}
              />
            )}
          />
        )}
        <Touch
          label="Close guides"
          onPress={() => router.back()}
          className="absolute top-[var(--guide-top)] left-[16px] h-[48px] w-[48px] rounded-full bg-black/50 items-center justify-center"
        >
          <MaterialIcons name="close" size={24} color="white" />
        </Touch>
        <Modal
          visible={description}
          transparent
          animationType="slide"
          onRequestClose={() => setDescription(false)}
        >
          <View className="flex-1 justify-end bg-black/60">
            <View className="rounded-t-[28px] bg-background px-[24px] pt-[20px] pb-[var(--guide-bottom)] gap-[16px]">
              <View className="flex-row items-center justify-between gap-[12px]">
                <View className="flex-1">
                  <Label variant="heading">{current?.title ?? ""}</Label>
                </View>
                <Touch
                  label="Close description"
                  onPress={() => setDescription(false)}
                  className="h-[48px] w-[48px] items-center justify-center"
                >
                  <MaterialIcons name="close" size={24} color={c.foreground} />
                </Touch>
              </View>
              <Label>{current?.summary ?? ""}</Label>
            </View>
          </View>
        </Modal>
      </View>
    </VariableContextProvider>
  );
}
