import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "expo-router/react-navigation";
import { Details } from "./details";
import { MessageBubble } from "../studio/message-bubble";
import { MessageComposer } from "../studio/message-composer";
import { useMutation, useQuery } from "convex/react";
import { Stack, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { api } from "../../../../../packages/backend/convex/_generated/api";
import { Button, ErrorBoundary, Loading, useStyles } from "./ui";

type Tab = "Chat" | "Details";
export function AppScreen() {
  const styles = useStyles();
  const { appId } = useLocalSearchParams<{ appId: string }>();
  const [tab, setTab] = useState<Tab>("Chat");
  return (
    <ErrorBoundary>
      <View style={styles.screen}>
        <Stack.Screen options={{ title: "Your app" }} />
        {appId && (
          <>
            <View style={{ padding: 24, gap: 16 }}>
              <AppTitle appId={appId} />
              <View style={styles.row}>
                {(["Chat", "Details"] as const).map((item) => (
                  <Pressable
                    key={item}
                    accessibilityRole="button"
                    accessibilityState={{ selected: tab === item }}
                    onPress={() => setTab(item)}
                    style={[styles.chip, tab === item && styles.selected]}
                  >
                    <Text style={styles.text}>{item}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            {tab === "Chat" ? (
              <Chat appId={appId} />
            ) : (
              <ScrollView contentContainerStyle={styles.content}>
                <Details appId={appId} />
              </ScrollView>
            )}
          </>
        )}
      </View>
    </ErrorBoundary>
  );
}
function AppTitle({ appId }: { appId: string }) {
  const styles = useStyles();
  const app = useQuery(api.apps.index.get, { appId });
  return app ? <Text style={styles.title}>{app.name}</Text> : <Loading />;
}
function Chat({ appId }: { appId: string }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const list = useRef<FlatList>(null);
  const revealSent = useRef(false);
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
  async function submit() {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const submitted = prompt;
      revealSent.current = true;
      await send({ appId, prompt: submitted.trim() });
      setPrompt((current) => (current === submitted ? "" : current));
      setCursors([null]);
    } catch (e) {
      revealSent.current = false;
      setError(e instanceof Error ? e.message : "Could not send message.");
    } finally {
      setBusy(false);
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
  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={headerHeight}
      style={{ flex: 1 }}
    >
      <FlatList
        ref={list}
        data={[...history.page].reverse()}
        keyExtractor={(message) => message.id}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: Math.max(insets.left, insets.right, 24),
          paddingVertical: 24,
          gap: 22,
        }}
        onContentSizeChange={() => {
          if (revealSent.current) {
            list.current?.scrollToEnd({ animated: false });
            revealSent.current = false;
          }
        }}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <Text style={styles.muted}>{history.status}</Text>
            {!!history.error && (
              <Text accessibilityRole="alert" style={styles.text}>
                {history.error}
              </Text>
            )}
            {!history.isDone && (
              <Button
                title="Older messages"
                onPress={() => setCursors([...cursors, history.continueCursor])}
              />
            )}
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.muted}>
            No messages yet. Tell the agent what you want to build.
          </Text>
        }
        renderItem={({ item }) => (
          <MessageBubble
            message={{ role: item.role, text: item.content || "Working…" }}
          />
        )}
        ListFooterComponent={
          cursors.length > 1 ? (
            <Button
              title="Newer messages"
              onPress={() => setCursors(cursors.slice(0, -1))}
            />
          ) : undefined
        }
      />
      <View
        style={{
          gap: 12,
          paddingHorizontal: 24,
          paddingTop: 12,
          paddingBottom: Math.max(insets.bottom, 16),
        }}
      >
        <MessageComposer
          value={prompt}
          onChange={setPrompt}
          onSend={() => void submit()}
          label="Message"
          testID="chat-message"
          placeholder="Ask for a change…"
          sending={busy}
          disabled={history.status === "stopping" || history.stopUnconfirmed}
        />
        <View style={styles.row}>
          {(running || history.stopUnconfirmed) && (
            <Button
              title={
                history.status === "stopping"
                  ? "Stopping..."
                  : history.stopUnconfirmed
                    ? "Retry stop"
                    : "Stop"
              }
              disabled={busy || history.status === "stopping"}
              onPress={() => void stop()}
            />
          )}
        </View>
        {!!error && (
          <Text accessibilityRole="alert" style={styles.text}>
            {error}
          </Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
