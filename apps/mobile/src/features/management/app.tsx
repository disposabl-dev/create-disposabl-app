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
} from "react-native";
import { api } from "../../../../../packages/backend/convex/_generated/api";
import { Button, ErrorBoundary, Loading, useStyles } from "./ui";
import { isNearConversationEnd } from "./conversation-scroll";
import { ResponseProgress } from "./response-progress";
import { ConversationHeader } from "./conversation-header";

export function AppScreen() {
  const styles = useStyles();
  const { appId } = useLocalSearchParams<{ appId: string }>();
  return (
    <ErrorBoundary>
      <View style={styles.screen}>
        {appId && <ConversationHeader appId={appId} />}
        {appId && <Chat key={appId} appId={appId} />}
      </View>
    </ErrorBoundary>
  );
}
export function AppDetailsScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { appId } = useLocalSearchParams<{ appId: string }>();
  return (
    <ErrorBoundary>
      <View style={styles.screen}>
        <Stack.Screen options={{ title: "Details" }} />
        {appId && (
          <ScrollView
            contentContainerStyle={[
              styles.content,
              {
                width: "100%",
                maxWidth: 820,
                alignSelf: "center",
                paddingLeft: Math.max(insets.left, 24),
                paddingRight: Math.max(insets.right, 24),
                paddingBottom: Math.max(insets.bottom, 48),
              },
            ]}
          >
            <Details appId={appId} />
          </ScrollView>
        )}
      </View>
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
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
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
    return <Text style={styles.muted}>Conversation unavailable.</Text>;
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
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={headerHeight}
      style={{ flex: 1 }}
    >
      <FlatList
        ref={list}
        style={{ flex: 1 }}
        data={messages}
        keyExtractor={(message) => message.id}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingLeft: Math.max(insets.left, 20),
          paddingRight: Math.max(insets.right, 20),
          paddingVertical: 24,
          gap: 22,
          width: "100%",
          maxWidth: 820,
          alignSelf: "center",
        }}
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
          <View style={{ gap: 12 }}>
            {!!history.error && (
              <Text accessibilityRole="alert" style={styles.text}>
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
          <Text style={styles.muted}>
            No messages yet. Tell the agent what you want to build.
          </Text>
        }
        renderItem={({ item, index }) => (
          <View style={{ gap: 12 }}>
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
        style={{
          gap: 12,
          paddingTop: 12,
          paddingBottom: Math.max(insets.bottom, 16),
          width: "100%",
          maxWidth: 820,
          alignSelf: "center",
          paddingLeft: Math.max(insets.left, 24),
          paddingRight: Math.max(insets.right, 24),
        }}
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
          <Text accessibilityRole="alert" style={styles.text}>
            {error}
          </Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
