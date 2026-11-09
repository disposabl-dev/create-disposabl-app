import { AccountScreen } from "@disposabl/disposabl-kit/mobile";
import { router } from "expo-router";
import { PreferenceRow } from "../../../../packages/disposabl-kit/mobile/design/preferences";
import {
  AnalyticsPreference,
  captureProductAction,
} from "../features/product-telemetry";

export default function Settings() {
  return (
    <AccountScreen
      sections={<AnalyticsPreference />}
      accountRows={
        <PreferenceRow
          icon={{ ios: "link", android: "link" }}
          label="Manage connections"
          onPress={() => {
            captureProductAction("open_connections");
            router.push("/connections");
          }}
        />
      }
    />
  );
}
