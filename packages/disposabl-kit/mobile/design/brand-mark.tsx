import { Image, Text } from "react-native";
import { appName } from "../../lib/app-name";
import { useResolvedColorScheme } from "./theme-provider";

export function BrandMark() {
  const dark = useResolvedColorScheme() === "dark";
  if (!appName) return null;
  if (appName !== "Disposabl")
    return (
      <Text
        style={{
          color: dark ? "#fff" : "#161b2e",
          fontSize: 22,
          fontWeight: "600",
          textAlign: "center",
          marginBottom: 12,
        }}
      >
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
      style={{ width: 92, height: 92, alignSelf: "center", marginBottom: 12 }}
    />
  );
}
