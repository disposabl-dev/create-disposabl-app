import { Pressable, TextInput, View } from "react-native";
import { useTheme } from "../../../../../packages/disposabl-kit/mobile/design/use-theme";
import { GlassSurface, Icon, Label, feedback } from "./ui";

// Preserve the original glass composer, exposing only actions the agent supports.
export function MessageComposer({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = "Describe your idea…",
  label = "Your app idea",
  testID = "app-idea",
  sending = false,
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  label?: string;
  testID?: string;
  sending?: boolean;
  compact?: boolean;
}) {
  const c = useTheme();
  return (
    <GlassSurface
      style={{
        padding: 8,
        borderRadius: 28,
        gap: 4,
        flexDirection: compact ? "row" : "column",
        alignItems: compact ? "flex-end" : "stretch",
      }}
    >
      <TextInput
        value={value}
        onChangeText={onChange}
        multiline
        scrollEnabled
        placeholder={placeholder}
        placeholderTextColor={c.mutedForeground}
        accessibilityLabel={label}
        testID={testID}
        style={{
          fontSize: 17,
          lineHeight: 24,
          minHeight: compact ? 48 : 100,
          maxHeight: compact ? 120 : 176,
          flex: compact ? 1 : undefined,
          paddingHorizontal: 12,
          paddingTop: 10,
          paddingBottom: 6,
          color: c.foreground,
          textAlignVertical: "top",
        }}
      />
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingLeft: 12,
        }}
      >
        {!compact && (
          <View style={{ flex: 1 }}>
            <Label variant="caption" color={c.mutedForeground}>
              {sending ? "Sending…" : "Start with your idea."}
            </Label>
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          testID={compact ? "send-message" : "create-app"}
          disabled={disabled || sending || !value.trim()}
          onPress={() => {
            feedback();
            onSend();
          }}
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: c.foreground,
            alignItems: "center",
            justifyContent: "center",
            opacity: disabled || sending || !value.trim() ? 0.4 : 1,
          }}
        >
          <Icon name="send" color={c.background} />
        </Pressable>
      </View>
    </GlassSurface>
  );
}
