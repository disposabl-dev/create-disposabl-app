import { AccountScreen } from "@disposabl/disposabl-kit/mobile";
import { router } from "expo-router";
import { PreferenceRow } from "../../../../packages/disposabl-kit/mobile/design/preferences";

export default function Settings() {
  return (
    <AccountScreen
      accountRows={
        <PreferenceRow
          icon={{ ios: "link", android: "link" }}
          label="Manage connections"
          onPress={() => router.push("/connections")}
        />
      }
    />
  );
}
