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
  message: {
    role: string;
    text: string;
    attachments?: { id: string; filename: string; mediaType: string }[];
  };
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
      className={
        user
          ? "self-end max-w-[86%] rounded-[24px] px-[20px] py-[16px] gap-[12px] bg-foreground"
          : "w-[100%] gap-[12px]"
      }
    >
      {!!message.text &&
        (user ? (
          <Text
            selectable
            className="text-background text-[17px] leading-[26px]"
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
      {!!message.attachments?.length && (
        <View className="flex-row flex-wrap gap-[8px]">
          {message.attachments.map((attachment) => (
            <View
              key={attachment.id}
              accessibilityLabel={`Attachment: ${attachment.filename}`}
              className={`rounded-[16px] border px-[12px] py-[8px] ${user ? "border-background" : "border-border"}`}
            >
              <Text
                numberOfLines={1}
                className={`max-w-[200px] ${user ? "text-background" : "text-foreground"}`}
              >
                {attachment.filename}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
});
