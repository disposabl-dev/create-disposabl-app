import { VariableContextProvider } from "nativewind";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "expo-router/react-navigation";
import { Details } from "./details";
import { MessageBubble } from "../studio/message-bubble";
import { MessageComposer } from "../studio/message-composer";
import { useAttachments } from "../studio/attachments";
import { attachmentIds } from "../studio/attachment-policy";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Stack, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { api } from "../../../../../packages/backend/convex/_generated/api";
import { Button, ErrorBoundary, Loading } from "./ui";
import { isNearConversationEnd } from "./conversation-scroll";
import { ResponseProgress } from "./response-progress";
import { ConversationHeader } from "./conversation-header";

export function AppScreen() {
  const { appId } = useLocalSearchParams<{ appId: string }>();
  return (
    <ErrorBoundary>
      <View className="flex-1 bg-background">
        {appId && <ConversationHeader appId={appId} />}
        {appId && <Chat key={appId} appId={appId} />}
      </View>
    </ErrorBoundary>
  );
}
export function AppDetailsScreen() {
  const insets = useSafeAreaInsets();
  const { appId } = useLocalSearchParams<{ appId: string }>();
  return (
    <ErrorBoundary>
      <VariableContextProvider
        value={{
          "--details-left": Math.max(insets.left, 24),
          "--details-right": Math.max(insets.right, 24),
          "--details-bottom": Math.max(insets.bottom, 48),
        }}
      >
        <View className="flex-1 bg-background">
          <Stack.Screen options={{ title: "Details" }} />
          {appId && (
            <ScrollView contentContainerClassName="w-full max-w-[820px] self-center gap-[20px] pt-[24px] pl-[var(--details-left)] pr-[var(--details-right)] pb-[var(--details-bottom)]">
              <Details appId={appId} />
            </ScrollView>
          )}
        </View>
      </VariableContextProvider>
    </ErrorBoundary>
  );
}
function Chat({ appId }: { appId: string }) {
  const {
    attachments,
    beginSend,
    markSent,
    sendFailed,
    isActive,
    pick,
    retry,
    remove,
    busy: attachmentsBusy,
  } = useAttachments();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { width, height } = useWindowDimensions();
  const compactViewport = width > height;
  const list = useRef<FlatList>(null);
  const followLatest = useRef(true);
  const userScrolling = useRef(false);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const cursor = cursors[cursors.length - 1];
  const history = useQuery(api.agent.index.getMessages, {
    appId,
    paginationOpts: { numItems: 20, cursor },
  });
  const send = useMutation(api.agent.index.sendMessage);
  const abort = useMutation(api.agent.index.abortMessage);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(text: string) {
    const fileIds = attachmentIds(attachments);
    if (!text.trim() || busy || attachmentsBusy || !fileIds) return;
    if (!beginSend(fileIds)) return;
    setBusy(true);
    setError("");
    try {
      const submitted = text;
      const originalPrompt = prompt;
      followLatest.current = true;
      await send({
        appId,
        prompt: submitted.trim(),
        ...(fileIds.length ? { fileIds } : {}),
      });
      markSent(fileIds);
      if (!isActive()) return;
      setPrompt((current) =>
        current === submitted || current === originalPrompt ? "" : current,
      );
      setCursors([null]);
    } catch (e) {
      sendFailed(fileIds, e instanceof ConvexError);
      if (isActive())
        setError(e instanceof Error ? e.message : "Could not send message.");
    } finally {
      if (isActive()) setBusy(false);
    }
  }
  async function stop() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await abort({ appId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not stop the agent.");
    } finally {
      setBusy(false);
    }
  }
  if (!history) return <Loading />;
  if (history.kind !== "messages")
    return (
      <Text className="text-[14px] leading-[21px] text-muted-foreground">
        Conversation unavailable.
      </Text>
    );
  const running =
    history.status === "processing" || history.status === "stopping";
  const messages = [...history.page]
    .reverse()
    .filter((message) => message.content.trim() || message.attachments?.length);
  const lastUser = messages.findLastIndex((message) => message.role === "user");
  const responseIndex = messages.findIndex(
    (message, index) => index > lastUser && message.role === "assistant",
  );
  const progress =
    cursors.length === 1 ? (
      <ResponseProgress
        startedAt={history.startedAt}
        finishedAt={history.finishedAt}
        running={running}
      />
    ) : undefined;
  return (
    <VariableContextProvider
      value={{
        "--chat-left": Math.max(insets.left, 20),
        "--chat-right": Math.max(insets.right, 20),
        "--composer-left": Math.max(insets.left, 24),
        "--composer-right": Math.max(insets.right, 24),
        "--composer-bottom": Math.max(insets.bottom, compactViewport ? 4 : 16),
      }}
    >
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={headerHeight}
        className="flex-1"
      >
        <FlatList
          ref={list}
          testID="chat-transcript"
          className="flex-1"
          data={messages}
          keyExtractor={(message) => message.id}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="w-full max-w-[820px] self-center gap-[22px] py-[24px] pl-[var(--chat-left)] pr-[var(--chat-right)]"
          onScrollBeginDrag={() => {
            userScrolling.current = true;
          }}
          onScrollEndDrag={() => {
            userScrolling.current = false;
          }}
          onMomentumScrollBegin={() => {
            userScrolling.current = true;
          }}
          onMomentumScrollEnd={() => {
            userScrolling.current = false;
          }}
          onScroll={({ nativeEvent }) => {
            if (userScrolling.current && cursors.length === 1)
              followLatest.current = isNearConversationEnd(
                nativeEvent.contentOffset.y,
                nativeEvent.layoutMeasurement.height,
                nativeEvent.contentSize.height,
              );
          }}
          scrollEventThrottle={16}
          onLayout={() => {
            if (cursors.length === 1 && followLatest.current)
              list.current?.scrollToEnd({ animated: false });
          }}
          onContentSizeChange={() => {
            if (cursors.length === 1 && followLatest.current) {
              list.current?.scrollToEnd({ animated: false });
            }
          }}
          ListHeaderComponent={
            <View className="gap-[12px]">
              {!!history.error && (
                <Text
                  accessibilityRole="alert"
                  className="text-[16px] leading-[23px] text-foreground"
                >
                  {history.error}
                </Text>
              )}
              {!history.isDone && (
                <Button
                  title="Older messages"
                  onPress={() => {
                    followLatest.current = false;
                    setCursors([...cursors, history.continueCursor]);
                  }}
                />
              )}
            </View>
          }
          ListEmptyComponent={
            <Text className="text-[14px] leading-[21px] text-muted-foreground">
              No messages yet. Tell the agent what you want to build.
            </Text>
          }
          renderItem={({ item, index }) => (
            <View className="gap-[12px]">
              {index === responseIndex && progress}
              <MessageBubble
                message={{
                  role: item.role,
                  text: item.content,
                  attachments: item.attachments,
                }}
              />
            </View>
          )}
          ListFooterComponent={
            cursors.length > 1 ? (
              <Button
                title="Newer messages"
                onPress={() => {
                  followLatest.current = cursors.length === 2;
                  setCursors(cursors.slice(0, -1));
                }}
              />
            ) : responseIndex === -1 ? (
              progress
            ) : undefined
          }
        />
        <View
          className={`w-full max-w-[820px] self-center gap-[12px] ${compactViewport ? "pt-[4px]" : "pt-[12px]"} pb-[var(--composer-bottom)] pl-[var(--composer-left)] pr-[var(--composer-right)]`}
        >
          <MessageComposer
            attachments={attachments}
            onPickAttachment={(source) => void pick(source)}
            onRemoveAttachment={(index) => void remove(attachments[index])}
            onRetryAttachment={(index) => void retry(attachments[index])}
            attachmentsBusy={attachmentsBusy}
            value={prompt}
            onChange={setPrompt}
            onSend={(text) => void submit(text)}
            onStop={() => void stop()}
            stopAvailable={running || history.stopUnconfirmed}
            stopRequired={history.stopUnconfirmed}
            stopping={history.status === "stopping"}
            label="Message"
            testID="chat-message"
            placeholder="Ask for a change…"
            sending={busy}
            compact
            disabled={history.status === "stopping" || history.stopUnconfirmed}
          />
          {!!error && (
            <Text
              accessibilityRole="alert"
              className="text-[16px] leading-[23px] text-foreground"
            >
              {error}
            </Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </VariableContextProvider>
  );
}
