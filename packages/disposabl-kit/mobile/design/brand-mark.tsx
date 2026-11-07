import { Image } from "react-native";
import { useResolvedColorScheme } from "./theme-provider";

export function BrandMark() {
  const dark = useResolvedColorScheme() === "dark";
  return (
    <Image
      source={
        dark
          ? require("../lib/logo-light.png")
          : require("../lib/logo-dark.png")
      }
      accessibilityLabel="App logo"
      resizeMode="contain"
      style={{ width: 92, height: 92, alignSelf: "center", marginBottom: 12 }}
    />
  );
}
