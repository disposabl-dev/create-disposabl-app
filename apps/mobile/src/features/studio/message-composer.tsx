import { VariableContextProvider } from "nativewind";
import { MenuView } from "../../../../../packages/disposabl-kit/mobile/design/nativewind";
import { useState } from "react";
import {
  Dimensions,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
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
  const { width, height } = useWindowDimensions();
  const screen = Dimensions.get("screen");
  const compactLandscape =
    process.env.EXPO_OS === "android" &&
    width > height &&
    screen.width > screen.height;
  const [expanded, setExpanded] = useState(false);
  const inline = compact && (compactLandscape || !expanded || !value);
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
      disableFullscreenUI
      onContentSizeChange={({ nativeEvent }) => {
        if (inline && nativeEvent.contentSize.height > 56) setExpanded(true);
        else if (!value) setExpanded(false);
      }}
      scrollEnabled
      placeholder={placeholder}
      placeholderTextColor={c.mutedForeground}
      accessibilityLabel={label}
      testID={testID}
      className={`w-full pt-[10px] pb-[6px] text-[17px] leading-[24px] text-foreground align-top ${inline ? "min-h-[44px] pl-[52px] pr-[96px]" : compact ? "min-h-[44px] px-[8px]" : "min-h-[100px] px-[8px]"} ${compact ? (compactLandscape ? "max-h-[44px]" : "max-h-[120px]") : "max-h-[176px]"}`}
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
        className={`size-[44px] items-center justify-center ${blocked ? "opacity-40" : ""}`}
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
        className={`size-[44px] items-center justify-center ${blocked ? "opacity-40" : ""}`}
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
        className={`size-[44px] items-center justify-center rounded-full bg-foreground ${actionEnabled ? "" : "opacity-40"}`}
      >
        {showStop ? (
          <View className="w-[16px] h-[16px] rounded-[3px] bg-background" />
        ) : (
          <Icon name="send" color={c.background} />
        )}
      </Pressable>
    </>
  );
  return (
    <View className="gap-[8px]">
      {attachments.length > 0 && (
        <ScrollView
          horizontal
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="gap-[8px]"
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
              className="bg-card rounded-[16px] p-[10px] flex-row items-center gap-[8px]"
            >
              <Text numberOfLines={1} className="text-foreground max-w-[180px]">
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
          <View key={item.key} className="flex-row gap-[8px] items-center">
            <Text accessibilityRole="alert" className="text-destructive flex-1">
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
        <Text accessibilityRole="alert" className="text-destructive">
          {dictation.error}
        </Text>
      )}
      <GlassSurface className="p-[6px] rounded-[28px] gap-[4px]">
        {dictation.state !== "idle" ? (
          <View className="flex-row items-center gap-[8px]">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel dictation"
              onPress={dictation.cancel}
              className="w-[44px] h-[44px] items-center justify-center"
            >
              <Icon name="close" />
            </Pressable>
            <View
              accessibilityLabel="Recording"
              className="flex-1 flex-row items-center justify-around"
            >
              {Array.from({ length: 20 }, (_, i) => (
                <VariableContextProvider
                  key={i}
                  value={{
                    "--layout-height":
                      3 +
                      Math.max(0, Math.min(1, dictation.level)) *
                        ((i % 4) + 1) *
                        4,
                  }}
                >
                  <View
                    key={i}
                    className="w-[3px] h-[var(--layout-height)] rounded-[2px] bg-muted-foreground"
                  />
                </VariableContextProvider>
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Stop dictation"
              disabled={dictation.state !== "listening"}
              onPress={dictation.stop}
              className={`size-[44px] items-center justify-center ${dictation.state === "listening" ? "" : "opacity-40"}`}
            >
              <View className="w-[16px] h-[16px] rounded-[3px] bg-foreground" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send dictation"
              disabled={blocked || dictation.state !== "listening"}
              onPress={dictation.send}
              className="w-[44px] h-[44px] rounded-[22px] bg-foreground items-center justify-center"
            >
              <Icon name="send" color={c.background} />
            </Pressable>
          </View>
        ) : (
          <>
            {input}
            <View
              pointerEvents="box-none"
              className={`flex-row items-end ${inline ? "absolute inset-x-[6px] bottom-[6px]" : ""}`}
            >
              {plus}
              <View pointerEvents="none" className="flex-1" />
              {actions}
            </View>
          </>
        )}
      </GlassSurface>
    </View>
  );
}
