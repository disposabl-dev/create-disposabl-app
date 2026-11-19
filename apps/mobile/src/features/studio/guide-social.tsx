import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { authenticationEnabled } from "@disposabl/disposabl-kit/features";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VariableContextProvider } from "nativewind";
import { useTheme } from "../../../../../packages/disposabl-kit/mobile/design/use-theme";
import { Label, Touch } from "./ui";

type Comment = {
  id: string;
  author: string;
  body: string;
  createdAt: number;
  mine: boolean;
};
type Stats = { likes: number; comments: number; liked: boolean };
const getStats = makeFunctionReference<"query", { lessonId: string }, Stats>(
  "guides/social:get",
);
const getComments = makeFunctionReference<
  "query",
  { lessonId: string },
  Comment[]
>("guides/social:listComments");
const setLike = makeFunctionReference<
  "mutation",
  { lessonId: string; liked: boolean },
  null
>("guides/social:setLike");
const postComment = makeFunctionReference<
  "mutation",
  { lessonId: string; body: string },
  null
>("guides/social:postComment");
const deleteComment = makeFunctionReference<
  "mutation",
  { commentId: string },
  null
>("guides/social:deleteComment");
const reportComment = makeFunctionReference<
  "mutation",
  { commentId: string },
  null
>("guides/social:reportComment");
const blockCommenter = makeFunctionReference<
  "mutation",
  { commentId: string },
  null
>("guides/social:blockCommenter");

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
  onCommentsChange,
}: {
  lessonId: string;
  title: string;
  muted: boolean;
  setMuted: React.Dispatch<React.SetStateAction<boolean>>;
  onCommentsChange: (open: boolean) => void;
}) {
  return authenticationEnabled ? (
    <SessionSocial
      lessonId={lessonId}
      title={title}
      muted={muted}
      setMuted={setMuted}
      onCommentsChange={onCommentsChange}
    />
  ) : (
    <Social
      lessonId={lessonId}
      title={title}
      muted={muted}
      setMuted={setMuted}
      onCommentsChange={onCommentsChange}
      authenticated={false}
    />
  );
}
function SessionSocial(
  props: Omit<React.ComponentProps<typeof Social>, "authenticated">,
) {
  const { isAuthenticated } = useConvexAuth();
  return <Social {...props} authenticated={isAuthenticated} />;
}
function Social({
  lessonId,
  title,
  muted,
  setMuted,
  onCommentsChange,
  authenticated,
}: {
  lessonId: string;
  title: string;
  muted: boolean;
  setMuted: React.Dispatch<React.SetStateAction<boolean>>;
  onCommentsChange: (open: boolean) => void;
  authenticated: boolean;
}) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const stats = useQuery(getStats, { lessonId });
  const comments = useQuery(getComments, open ? { lessonId } : "skip");
  const like = useMutation(setLike);
  const post = useMutation(postComment);
  const remove = useMutation(deleteComment);
  const report = useMutation(reportComment);
  const block = useMutation(blockCommenter);
  const close = () => {
    setOpen(false);
    onCommentsChange(false);
  };
  const signIn = () => {
    close();
    router.push({
      pathname: "/(auth)/login",
      params: { returnTo: `/guide-detail?id=${encodeURIComponent(lessonId)}` },
    });
  };
  const run = (operation: Promise<unknown>) => {
    void operation.catch(() =>
      Alert.alert("Could not complete that action", "Please try again."),
    );
  };
  const actions = (comment: Comment) => {
    if (!authenticated) {
      signIn();
      return;
    }
    Alert.alert("Comment", undefined, [
      ...(comment.mine
        ? [
            {
              text: "Delete comment",
              style: "destructive" as const,
              onPress: () => run(remove({ commentId: comment.id })),
            },
          ]
        : [
            {
              text: "Report comment",
              onPress: () => run(report({ commentId: comment.id })),
            },
            {
              text: "Block this person",
              style: "destructive" as const,
              onPress: () =>
                Alert.alert(
                  "Block this person?",
                  "Their comments will be hidden from you.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Block",
                      style: "destructive",
                      onPress: () => run(block({ commentId: comment.id })),
                    },
                  ],
                ),
            },
          ]),
      { text: "Cancel", style: "cancel" },
    ]);
  };
  return (
    <VariableContextProvider
      value={{
        "--social-bottom": Math.max(insets.bottom, 24),
        "--social-top": Math.max(insets.top, 16),
      }}
    >
      <View className="absolute right-[12px] bottom-[var(--social-bottom)] gap-[10px] items-center">
        <Action
          label={stats?.liked ? "Unlike guide" : "Like guide"}
          icon={stats?.liked ? "favorite" : "favorite-border"}
          count={stats?.likes}
          color={stats?.liked ? "#ff6b82" : "white"}
          onPress={() =>
            authenticated
              ? run(like({ lessonId, liked: !stats?.liked }))
              : signIn()
          }
        />
        <Action
          label="View comments"
          icon="chat-bubble-outline"
          count={stats?.comments}
          onPress={() => {
            setOpen(true);
            onCommentsChange(true);
          }}
        />
        <Action
          label="Share guide"
          icon="ios-share"
          onPress={() => {
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
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={close}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1 justify-end bg-black/60"
        >
          <View className="h-[75%] rounded-t-[28px] bg-background pt-[18px] pb-[var(--social-bottom)]">
            <View className="flex-row items-center justify-between px-[24px]">
              <Label variant="heading">Comments</Label>
              <Touch
                label="Close comments"
                onPress={close}
                className="w-[48px] items-center justify-center"
              >
                <MaterialIcons
                  name="close"
                  size={24}
                  color={theme.foreground}
                />
              </Touch>
            </View>
            <KeyboardAwareScrollView
              bottomOffset={24}
              keyboardShouldPersistTaps="handled"
              className="flex-1"
              contentContainerClassName="px-[24px] gap-[18px] pb-[20px]"
            >
              {comments === undefined ? (
                <Label>Loading comments…</Label>
              ) : comments.length === 0 ? (
                <Label>Be the first to comment.</Label>
              ) : (
                comments.map((comment) => (
                  <View key={comment.id} className="flex-row gap-[12px]">
                    <View className="flex-1 gap-[4px]">
                      <Text className="text-foreground font-semibold">
                        {comment.author}
                      </Text>
                      <Text className="text-foreground leading-[21px]">
                        {comment.body}
                      </Text>
                    </View>
                    <Touch
                      label={`Options for ${comment.author}'s comment`}
                      onPress={() => actions(comment)}
                      className="w-[44px] items-center justify-start"
                    >
                      <MaterialIcons
                        name="more-horiz"
                        size={22}
                        color={theme.foreground}
                      />
                    </Touch>
                  </View>
                ))
              )}
            </KeyboardAwareScrollView>
            {authenticated ? (
              <View className="px-[24px] gap-[8px]">
                <View className="flex-row items-end gap-[8px]">
                  <TextInput
                    value={body}
                    onChangeText={setBody}
                    maxLength={600}
                    multiline
                    placeholder="Add a comment"
                    placeholderTextColor={theme.mutedForeground}
                    accessibilityLabel="Add a comment"
                    className="flex-1 min-h-[48px] max-h-[100px] rounded-[16px] bg-muted px-[14px] py-[12px] text-foreground"
                  />
                  <Touch
                    label="Post comment"
                    onPress={() => {
                      const text = body.trim();
                      if (!text || sending) return;
                      setSending(true);
                      void post({ lessonId, body: text })
                        .then(() => setBody(""))
                        .catch((error: unknown) =>
                          Alert.alert(
                            "Could not post comment",
                            error instanceof ConvexError &&
                              typeof error.data === "string"
                              ? error.data
                              : "Please try again.",
                          ),
                        )
                        .finally(() => setSending(false));
                    }}
                    className="min-w-[48px] items-center justify-center"
                  >
                    <MaterialIcons
                      name="send"
                      size={24}
                      color={theme.foreground}
                    />
                  </Touch>
                </View>
                <Text className="text-muted-foreground text-[12px]">
                  By commenting, you agree to our{" "}
                  <Text
                    accessibilityRole="link"
                    onPress={() =>
                      void Linking.openURL("https://disposabl.dev/legal/terms")
                    }
                  >
                    Terms
                  </Text>
                  .
                </Text>
              </View>
            ) : (
              <View className="px-[24px]">
                <Touch
                  label="Sign in to comment"
                  onPress={signIn}
                  className="items-center justify-center rounded-[16px] bg-foreground"
                >
                  <Text className="text-background font-semibold">
                    Sign in to comment
                  </Text>
                </Touch>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </VariableContextProvider>
  );
}
