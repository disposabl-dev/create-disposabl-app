import { Alert, Platform, Share, Text, View } from "react-native";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VariableContextProvider } from "nativewind";
import { api } from "../../../../../packages/disposabl-kit/mobile/lib/convex";
import { Touch } from "./ui";

function Action({
  label,
  icon,
  count,
  onPress,
  color = "white",
}: {
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  count?: number;
  onPress: () => void;
  color?: string;
}) {
  return (
    <Touch
      label={label}
      onPress={onPress}
      className="items-center justify-center gap-[2px] min-w-[56px] py-[5px]"
    >
      <MaterialIcons name={icon} size={28} color={color} />
      {count !== undefined && (
        <Text className="text-white text-[12px] font-semibold">{count}</Text>
      )}
    </Touch>
  );
}

export function GuideSocial({
  lessonId,
  title,
  muted,
  setMuted,
  onShare,
}: {
  lessonId: string;
  title: string;
  muted: boolean;
  setMuted: React.Dispatch<React.SetStateAction<boolean>>;
  onShare: () => void;
}) {
  const { isAuthenticated } = useConvexAuth();
  const insets = useSafeAreaInsets();
  const stats = useQuery(api.guides.social.get, { lessonId });
  const like = useMutation(api.guides.social.setLike);
  return (
    <VariableContextProvider
      value={{
        "--social-bottom": Math.max(insets.bottom, 24),
        "--social-right": insets.right + 12,
      }}
    >
      <View className="absolute right-[var(--social-right)] bottom-[var(--social-bottom)] gap-[10px] items-center">
        <Action
          label={
            isAuthenticated
              ? stats?.liked
                ? "Unlike guide"
                : "Like guide"
              : "Sign in to like guide"
          }
          icon={stats?.liked ? "favorite" : "favorite-border"}
          count={stats?.likes}
          color={stats?.liked ? "#ff6b82" : "white"}
          onPress={() => {
            if (!isAuthenticated) {
              onShare();
              router.push({
                pathname: "/(auth)/login",
                params: {
                  returnTo: `/guide-detail?id=${encodeURIComponent(lessonId)}`,
                },
              });
            } else if (stats) {
              void like({ lessonId, liked: !stats.liked }).catch(() =>
                Alert.alert("Could not like this guide", "Please try again."),
              );
            }
          }}
        />
        <Action
          label="Share guide"
          icon="ios-share"
          onPress={() => {
            onShare();
            const url = `https://disposabl.dev/guides?lesson=${encodeURIComponent(lessonId)}`;
            void Share.share(
              Platform.OS === "ios"
                ? { url, message: title }
                : { message: `${title}\n${url}` },
            ).catch(() => Alert.alert("Could not share", "Please try again."));
          }}
        />
        <Action
          label={muted ? "Unmute video" : "Mute video"}
          icon={muted ? "volume-off" : "volume-up"}
          onPress={() => setMuted((value) => !value)}
        />
      </View>
    </VariableContextProvider>
  );
}
