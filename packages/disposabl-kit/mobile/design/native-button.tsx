import { Button } from "@expo/ui";
import { controlSize } from "@expo/ui/swift-ui/modifiers";
import type { ComponentProps } from "react";

type Props = Omit<ComponentProps<typeof Button>, "children" | "label"> & {
  label: string;
};

/** Plain labels avoid RawText children in SwiftUI and Compose hosts. */
export function NativeButton({ modifiers, ...props }: Props) {
  return (
    <Button
      {...props}
      modifiers={[
        ...(process.env.EXPO_OS === "ios" ? [controlSize("large")] : []),
        ...(modifiers ?? []),
      ]}
    />
  );
}
