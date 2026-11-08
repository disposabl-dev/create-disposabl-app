import { Component, type ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

export function Button({
  title,
  onPress,
  disabled = false,
  testID,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      className={`self-start rounded-[30px] bg-foreground px-[18px] py-[12px] ${disabled ? "opacity-50" : ""}`}
    >
      <Text className="text-[15px] font-bold text-background">{title}</Text>
    </Pressable>
  );
}
export function Loading() {
  return <ActivityIndicator accessibilityLabel="Loading" />;
}
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: string; attempt: number }
> {
  state = { error: "", attempt: 0 };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    if (this.state.error)
      return (
        <View className="gap-[12px] rounded-[24px] border border-border bg-card p-[20px]">
          <Text className="text-[16px] leading-[23px] text-foreground">
            Unable to load this screen.
          </Text>
          <Text className="text-[14px] leading-[21px] text-muted-foreground">
            {this.state.error}
          </Text>
          <Button
            title="Retry"
            onPress={() =>
              this.setState(({ attempt }) => ({
                error: "",
                attempt: attempt + 1,
              }))
            }
          />
        </View>
      );
    return (
      <View key={this.state.attempt} className="flex-1">
        {this.props.children}
      </View>
    );
  }
}
