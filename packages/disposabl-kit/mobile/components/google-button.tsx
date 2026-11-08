import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  Text,
  useColorScheme,
} from "react-native";

export function GoogleButton({
  onPress,
  disabled = false,
  pending = false,
}: {
  onPress: () => void;
  disabled?: boolean;
  pending?: boolean;
}) {
  const dark = useColorScheme() === "dark";
  const color = dark ? "#E3E3E3" : "#1F1F1F";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Sign in with Google"
      accessibilityState={{ disabled: disabled || pending, busy: pending }}
      disabled={disabled || pending}
      onPress={onPress}
      className={`min-h-[52px] flex-row items-center justify-center rounded-[12px] border border-[#747775] bg-white py-[14px] active:opacity-60 dark:border-[#8E918F] dark:bg-[#131314] ${Platform.OS === "ios" ? "gap-[12px] px-[16px]" : "gap-[10px] px-[12px]"} ${disabled || pending ? "opacity-60" : ""}`}
    >
      <Image
        source={require("../../lib/google-logo.png")}
        className="size-[20px]"
        resizeMode="contain"
        accessible={false}
      />
      <Text className="text-[16px] font-medium text-[#1F1F1F] dark:text-[#E3E3E3]">
        {pending ? "Signing in..." : "Sign in with Google"}
      </Text>
      {pending && <ActivityIndicator color={color} />}
    </Pressable>
  );
}
