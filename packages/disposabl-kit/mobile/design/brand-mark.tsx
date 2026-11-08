import { Image, Text } from "react-native";
import { appName } from "../../lib/app-name";
import { useResolvedColorScheme } from "./theme-provider";

export function BrandMark() {
  const dark = useResolvedColorScheme() === "dark";
  if (!appName) return null;
  if (appName !== "Disposabl")
    return (
      <Text className="text-[#161b2e] dark:text-white text-[22px] font-semibold text-center mb-[12px]">
        {appName}
      </Text>
    );
  return (
    <Image
      source={
        dark
          ? require("../lib/logo-light.png")
          : require("../lib/logo-dark.png")
      }
      accessibilityLabel="App logo"
      resizeMode="contain"
      className="w-[92px] h-[92px] self-center mb-[12px]"
    />
  );
}
