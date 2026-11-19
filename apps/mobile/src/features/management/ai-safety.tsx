import { useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { Alert } from "react-native";
import { PreferenceRow } from "../../../../../packages/disposabl-kit/mobile/design/preferences";

import {
  AI_DISCLOSURE,
  CONSENT_VERSION,
} from "../../../../../packages/backend/convex/agent/disclosure";
const statusRef = makeFunctionReference<
  "query",
  Record<string, never>,
  boolean
>("agent/safety:status");
const consentRef = makeFunctionReference<
  "mutation",
  { granted: boolean; version: string },
  null
>("agent/safety:setConsent");
export const reportRef = makeFunctionReference<
  "mutation",
  {
    appId: string;
    messageId: string;
    reason: "offensive" | "unsafe" | "other";
  },
  string
>("agent/safety:report");
export function useAiConsent() {
  const allowed = useQuery(statusRef, {});
  const set = useMutation(consentRef);
  async function confirm(isActive: () => boolean) {
    if (allowed === undefined || !isActive()) return false;
    if (allowed) return true;
    const agreed = await new Promise<boolean>((resolve) =>
      Alert.alert(
        "Send to AI?",
        AI_DISCLOSURE,
        [
          { text: "Not now", style: "cancel", onPress: () => resolve(false) },
          { text: "Allow and send", onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      ),
    );
    if (!agreed || !isActive()) return false;
    try {
      await set({ granted: true, version: CONSENT_VERSION });
      return isActive();
    } catch {
      if (isActive()) Alert.alert("Permission not saved", "Please try again.");
      return false;
    }
  }
  return { allowed, confirm, set };
}
export function AiConsentPreference() {
  const { allowed, set } = useAiConsent();
  if (!allowed) return null;
  return (
    <PreferenceRow
      icon={{ ios: "lock", android: "lock" }}
      label="Revoke AI sharing"
      onPress={() => {
        Alert.alert(
          "Revoke AI sharing?",
          "New requests will be blocked. Already running remote work may continue; stop it in its conversation.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Revoke",
              style: "destructive",
              onPress: () => {
                void set({ granted: false, version: CONSENT_VERSION }).catch(
                  () =>
                    Alert.alert("Permission not changed", "Please try again."),
                );
              },
            },
          ],
        );
      }}
    />
  );
}
