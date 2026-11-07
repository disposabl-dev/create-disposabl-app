import { memo } from "react";
import { Alert, Linking, Text, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import {
  EnrichedMarkdownText,
  type MarkdownStyle,
} from "react-native-enriched-markdown";
import { useTheme } from "../../../../../packages/disposabl-kit/mobile/design/use-theme";

// Match the old project's unboxed assistant markdown and rounded user bubble.
export const MessageBubble = memo(function MessageBubble({
  message,
}: {
  message: { role: string; text: string };
}) {
  const c = useTheme();
  const reducedMotion = useReducedMotion();
  const user = message.role === "user";
  const markdownStyle: MarkdownStyle = {
    paragraph: {
      color: c.foreground,
      fontSize: 17,
      lineHeight: 26,
      marginBottom: 12,
    },
    h1: { color: c.foreground, fontSize: 28, marginTop: 16, marginBottom: 12 },
    h2: { color: c.foreground, fontSize: 24, marginTop: 16, marginBottom: 10 },
    h3: { color: c.foreground, fontSize: 20, marginTop: 12, marginBottom: 8 },
    h4: { color: c.foreground },
    h5: { color: c.foreground },
    h6: { color: c.foreground },
    list: {
      color: c.foreground,
      fontSize: 17,
      lineHeight: 26,
      bulletColor: c.foreground,
      markerColor: c.foreground,
    },
    blockquote: {
      color: c.foreground,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    code: { color: c.foreground, backgroundColor: c.card },
    codeBlock: {
      color: c.foreground,
      backgroundColor: c.card,
      borderColor: c.border,
      fontSize: 14,
    },
    link: { color: c.primaryText },
    taskList: { checkedTextColor: c.foreground },
    table: {
      color: c.foreground,
      headerTextColor: c.foreground,
      borderColor: c.border,
      headerBackgroundColor: c.card,
      rowEvenBackgroundColor: c.card,
      rowOddBackgroundColor: c.background,
    },
  };
  return (
    <View
      style={
        user
          ? {
              alignSelf: "flex-end",
              maxWidth: "86%",
              borderRadius: 24,
              paddingHorizontal: 20,
              paddingVertical: 16,
              gap: 12,
              backgroundColor: c.foreground,
            }
          : { width: "100%", gap: 12 }
      }
    >
      {!user && (
        <>
          <Text style={{ color: c.mutedForeground, fontSize: 14 }}>
            Assistant
          </Text>
          <View style={{ height: 1, backgroundColor: c.border }} />
        </>
      )}
      {!!message.text &&
        (user ? (
          <Text
            selectable
            style={{ color: c.background, fontSize: 17, lineHeight: 26 }}
          >
            {message.text}
          </Text>
        ) : (
          <EnrichedMarkdownText
            markdown={message.text}
            markdownStyle={markdownStyle}
            flavor="github"
            selectable
            streamingAnimation={!reducedMotion}
            enableTaskListItemToggle={false}
            onLinkPress={({ url }) => {
              if (/^https?:\/\//i.test(url))
                void Linking.openURL(url).catch(() =>
                  Alert.alert(
                    "Link unavailable",
                    "This link could not be opened.",
                  ),
                );
            }}
          />
        ))}
    </View>
  );
});
