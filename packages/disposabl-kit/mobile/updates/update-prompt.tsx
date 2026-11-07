import * as Updates from "expo-updates";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import {
  Alert,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchCurrentUpdate } from "./current-update";
import { foregroundCheck } from "./foreground-check";

/** Expo owns runtime compatibility and recovery. The user chooses when to restart. */
export function UpdatePrompt({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  const {
    isUpdatePending,
    isStartupProcedureRunning,
    isChecking,
    isDownloading,
  } = Updates.useUpdates();
  const [state, setState] = useState<"idle" | "error">("idle");
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const pendingForeground = useRef(false);
  const generation = useRef(0);
  const nativeBusy = useRef(false);
  const isNativeBusy = isStartupProcedureRunning || isChecking || isDownloading;
  useLayoutEffect(() => {
    nativeBusy.current = isNativeBusy;
  }, [isNativeBusy]);
  const enabled =
    !__DEV__ && Updates.isEnabled && process.env.EXPO_PUBLIC_E2E !== "true";

  const refresh = useCallback(
    async (restart = false) => {
      if (
        !enabled ||
        running.current ||
        nativeBusy.current ||
        AppState.currentState !== "active"
      )
        return;
      pendingForeground.current = false;
      running.current = true;
      const currentGeneration = generation.current;
      setBusy(true);
      try {
        const result = await fetchCurrentUpdate(
          Updates.checkForUpdateAsync,
          Updates.fetchUpdateAsync,
          Updates.isEmbeddedLaunch,
        );
        if (generation.current !== currentGeneration) return;
        setState("idle");
        // A download may finish after the app moves to the background.
        if (
          restart &&
          result === "ready" &&
          AppState.currentState === "active"
        ) {
          await Updates.reloadAsync();
        }
      } catch {
        // Offline launches keep working. Only an explicit restart reports failure.
        if (restart && generation.current === currentGeneration)
          setState("error");
      } finally {
        running.current = false;
        if (generation.current === currentGeneration) setBusy(false);
      }
    },
    [enabled],
  );

  useEffect(() => {
    if (!enabled) return;
    const effectGeneration = generation.current;
    // Native ON_LOAD downloads on cold launch and selects the latest cached
    // bundle. A long background interval triggers another download, not a reload.
    const markForegroundCheck = foregroundCheck(() => {
      pendingForeground.current = true;
    }, AppState.currentState);
    const listener = AppState.addEventListener("change", (next) => {
      markForegroundCheck(next);
      if (next === "active" && pendingForeground.current) void refresh();
    });
    return () => {
      generation.current = effectGeneration + 1;
      pendingForeground.current = false;
      listener.remove();
    };
  }, [enabled, refresh]);

  useEffect(() => {
    if (pendingForeground.current) void refresh();
  }, [busy, isNativeBusy, refresh]);

  const visible = enabled && (isUpdatePending || state === "error");

  return (
    <View style={styles.container}>
      {children}
      {visible && (
        <View
          style={[styles.notice, { bottom: Math.max(insets.bottom, 12) }]}
          accessibilityLiveRegion="polite"
        >
          <View style={styles.copy}>
            <Text style={styles.title}>
              {state === "error"
                ? "Could not apply the update"
                : "An update is ready"}
            </Text>
            <Text style={styles.description}>
              {state === "error"
                ? "Could not update. Check your connection and try again."
                : "Update now, or it will load the next time you start the app."}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{
              disabled: busy || isNativeBusy,
              busy: busy || isNativeBusy,
            }}
            disabled={busy || isNativeBusy}
            style={styles.button}
            onPress={() => {
              const confirmationGeneration = generation.current;
              Alert.alert(
                "Update now?",
                "Finish or save any unsent work before restarting.",
                [
                  { text: "Not now", style: "cancel" },
                  {
                    text: "Update now",
                    onPress: () => {
                      if (generation.current !== confirmationGeneration) return;
                      if (running.current || nativeBusy.current) {
                        Alert.alert(
                          "Checking for updates",
                          "Please try again when the check finishes.",
                        );
                        return;
                      }
                      void refresh(true);
                    },
                  },
                ],
              );
            }}
          >
            <Text style={styles.buttonText}>
              {busy || isNativeBusy
                ? "Updating..."
                : state === "error"
                  ? "Try again"
                  : "Update now"}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  notice: {
    position: "absolute",
    left: 16,
    right: 16,
    borderRadius: 20,
    padding: 16,
    backgroundColor: "#171717",
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  copy: { flex: 1, gap: 4 },
  title: { color: "#fff", fontSize: 15, fontWeight: "600" },
  description: { color: "#d4d4d4", fontSize: 13, lineHeight: 19 },
  button: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#fff",
  },
  buttonText: { color: "#171717", fontWeight: "600", fontSize: 14 },
});
