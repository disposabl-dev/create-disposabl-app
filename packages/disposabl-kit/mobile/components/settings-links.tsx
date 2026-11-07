import { Alert } from "react-native";
import { openBrowserAsync } from "expo-web-browser";
import config from "../../../../disposabl.json";
import {
  PreferenceRow,
  PreferenceSection,
  PreferenceSeparator,
} from "../design/preferences";

export function SettingsLinks() {
  const site = config.platforms.includes("web")
    ? process.env.EXPO_PUBLIC_CONVEX_SITE_URL
    : undefined;
  const status = process.env.EXPO_PUBLIC_STATUS_PAGE_URL;
  const statusUrl = status && /^https:\/\//.test(status) ? status : undefined;
  if (!site && !statusUrl) return null;

  async function open(url: string) {
    try {
      await openBrowserAsync(url);
    } catch {
      Alert.alert("Could not open page", "Please try again.");
    }
  }

  return (
    <PreferenceSection title="About">
      {site && (
        <>
          <PreferenceRow
            icon={{ ios: "hand.raised", android: "privacy_tip" }}
            label="Privacy policy"
            onPress={() => void open(`${site}/legal/privacy`)}
          />
          <PreferenceSeparator />
          <PreferenceRow
            icon={{ ios: "doc.text", android: "description" }}
            label="Terms of service"
            onPress={() => void open(`${site}/legal/terms`)}
          />
        </>
      )}
      {site && statusUrl && <PreferenceSeparator />}
      {statusUrl && (
        <PreferenceRow
          icon={{ ios: "waveform.path.ecg", android: "monitor_heart" }}
          label="Service status"
          onPress={() => void open(statusUrl)}
        />
      )}
    </PreferenceSection>
  );
}
