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
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  label?: string;
  testID?: string;
  sending?: boolean;
}) {
  const c = useTheme();
  return (
    <GlassSurface style={{ padding: 8, borderRadius: 28, gap: 4 }}>
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
          minHeight: 100,
          maxHeight: 176,
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
        <View style={{ flex: 1 }}>
          <Label variant="caption" color={c.mutedForeground}>
            {sending ? "Sending…" : "Start with your idea."}
          </Label>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          testID="create-app"
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
