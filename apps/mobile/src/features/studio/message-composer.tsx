import { MenuView } from "@expo/ui/community/menu";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useTheme } from "../../../../../packages/disposabl-kit/mobile/design/use-theme";
import { useDictation } from "../../../../../packages/disposabl-kit/mobile/components/use-dictation";
import type { Attachment, AttachmentSource } from "./attachments";
import { attachmentIds } from "./attachment-policy";
import { GlassSurface, Icon, feedback } from "./ui";

export function MessageComposer({
  value,
  onChange,
  onSend,
  onStop,
  stopAvailable = false,
  stopRequired = false,
  stopping = false,
  attachments,
  onPickAttachment,
  onRemoveAttachment,
  onRetryAttachment,
  attachmentsBusy = false,
  disabled = false,
  placeholder = "Describe your idea…",
  label = "Your app idea",
  testID = "app-idea",
  sending = false,
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string) => void;
  onStop?: () => void;
  stopAvailable?: boolean;
  stopRequired?: boolean;
  stopping?: boolean;
  attachments: Attachment[];
  onPickAttachment: (source: AttachmentSource) => void;
  onRemoveAttachment: (index: number) => void;
  onRetryAttachment: (index: number) => void;
  attachmentsBusy?: boolean;
  disabled?: boolean;
  placeholder?: string;
  label?: string;
  testID?: string;
  sending?: boolean;
  compact?: boolean;
}) {
  const c = useTheme();
  const [expanded, setExpanded] = useState(false);
  const inline = compact && (!expanded || !value);
  const actionsBusy = disabled || sending || attachmentsBusy;
  const blocked = actionsBusy || attachmentIds(attachments) === null;
  const dictation = useDictation({
    value,
    onChange,
    onSend,
    disabled: blocked,
  });
  const canSend = !blocked && !!value.trim();
  const showStop = !!onStop && stopAvailable && (!value.trim() || stopRequired);
  const actionEnabled = showStop ? !stopping && !sending : canSend;
  const input = (
    <TextInput
      value={value}
      onChangeText={onChange}
      multiline
      onContentSizeChange={({ nativeEvent }) => {
        if (inline && nativeEvent.contentSize.height > 56) setExpanded(true);
        else if (!value) setExpanded(false);
      }}
      scrollEnabled
      placeholder={placeholder}
      placeholderTextColor={c.mutedForeground}
      accessibilityLabel={label}
      testID={testID}
      style={{
        fontSize: 17,
        lineHeight: 24,
        minHeight: inline ? 44 : compact ? 44 : 100,
        maxHeight: compact ? 120 : 176,
        flex: inline ? 1 : undefined,
        paddingHorizontal: 8,
        paddingTop: 10,
        paddingBottom: 6,
        color: c.foreground,
        textAlignVertical: "top",
      }}
    />
  );
  const plus = (
    <MenuView
      actions={[
        {
          id: "camera",
          title: "Camera",
          image: "camera",
          attributes: { disabled: blocked },
        },
        {
          id: "photos",
          title: "Photos",
          image: "photo",
          attributes: { disabled: blocked },
        },
        {
          id: "files",
          title: "Files",
          image: "paperclip",
          attributes: { disabled: blocked },
        },
      ]}
      onPressAction={({ nativeEvent }) => {
        const source = nativeEvent.event;
        if (
          !blocked &&
          (source === "camera" || source === "photos" || source === "files")
        ) {
          feedback();
          onPickAttachment(source);
        }
      }}
    >
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel="Add attachment"
        accessibilityState={{ disabled: blocked }}
        style={{
          width: 44,
          height: 44,
          alignItems: "center",
          justifyContent: "center",
          opacity: blocked ? 0.4 : 1,
        }}
      >
        <Icon name="plus" size={25} />
      </View>
    </MenuView>
  );
  const actions = (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dictation"
        accessibilityState={{ disabled: blocked }}
        disabled={blocked}
        onPress={() => void dictation.start()}
        style={{
          width: 44,
          height: 44,
          alignItems: "center",
          justifyContent: "center",
          opacity: blocked ? 0.4 : 1,
        }}
      >
        <Icon name="mic" />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          showStop
            ? stopping
              ? "Stopping"
              : stopRequired
                ? "Retry stop"
                : "Stop generating"
            : "Send message"
        }
        testID={
          showStop ? "stop-agent" : compact ? "send-message" : "create-app"
        }
        disabled={!actionEnabled}
        onPress={() => {
          feedback();
          if (showStop) onStop?.();
          else onSend(value);
        }}
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: c.foreground,
          alignItems: "center",
          justifyContent: "center",
          opacity: actionEnabled ? 1 : 0.4,
        }}
      >
        {showStop ? (
          <View
            style={{
              width: 16,
              height: 16,
              borderRadius: 3,
              backgroundColor: c.background,
            }}
          />
        ) : (
          <Icon name="send" color={c.background} />
        )}
      </Pressable>
    </>
  );
  return (
    <View style={{ gap: 8 }}>
      {attachments.length > 0 && (
        <ScrollView
          horizontal
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 8 }}
        >
          {attachments.map((attachment, index) => (
            <Pressable
              key={attachment.key}
              accessibilityRole="button"
              accessibilityLabel={`${attachment.error ? "Retry" : "Remove"} ${attachment.name}`}
              disabled={actionsBusy}
              onPress={() =>
                attachment.error
                  ? onRetryAttachment(index)
                  : onRemoveAttachment(index)
              }
              style={{
                backgroundColor: c.card,
                borderRadius: 16,
                padding: 10,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Text
                numberOfLines={1}
                style={{ color: c.foreground, maxWidth: 180 }}
              >
                {attachment.name}
                {attachment.error
                  ? " · Retry"
                  : !attachment.id
                    ? " · Uploading…"
                    : ""}
              </Text>
              <Icon name={attachment.error ? "arrow" : "close"} size={16} />
            </Pressable>
          ))}
        </ScrollView>
      )}
      {attachments
        .filter((item) => item.error)
        .map((item) => (
          <View
            key={item.key}
            style={{ flexDirection: "row", gap: 8, alignItems: "center" }}
          >
            <Text
              accessibilityRole="alert"
              style={{ color: c.destructive, flex: 1 }}
            >
              {item.error}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${item.name}`}
              disabled={actionsBusy}
              onPress={() => onRemoveAttachment(attachments.indexOf(item))}
            >
              <Icon name="close" />
            </Pressable>
          </View>
        ))}
      {!!dictation.error && (
        <Text accessibilityRole="alert" style={{ color: c.destructive }}>
          {dictation.error}
        </Text>
      )}
      <GlassSurface style={{ padding: 6, borderRadius: 28, gap: 4 }}>
        {dictation.state !== "idle" ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel dictation"
              onPress={dictation.cancel}
              style={{
                width: 44,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="close" />
            </Pressable>
            <View
              accessibilityLabel="Recording"
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-around",
              }}
            >
              {Array.from({ length: 20 }, (_, i) => (
                <View
                  key={i}
                  style={{
                    width: 3,
                    height:
                      3 +
                      Math.max(0, Math.min(1, dictation.level)) *
                        ((i % 4) + 1) *
                        4,
                    borderRadius: 2,
                    backgroundColor: c.mutedForeground,
                  }}
                />
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Stop dictation"
              disabled={dictation.state !== "listening"}
              onPress={dictation.stop}
              style={{
                width: 44,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
                opacity: dictation.state === "listening" ? 1 : 0.4,
              }}
            >
              <View
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 3,
                  backgroundColor: c.foreground,
                }}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send dictation"
              disabled={blocked || dictation.state !== "listening"}
              onPress={dictation.send}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: c.foreground,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="send" color={c.background} />
            </Pressable>
          </View>
        ) : (
          <>
            {!inline && input}
            <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
              {plus}
              {inline ? input : <View style={{ flex: 1 }} />}
              {actions}
            </View>
          </>
        )}
      </GlassSurface>
    </View>
  );
}
