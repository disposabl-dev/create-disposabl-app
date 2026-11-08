import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useNavigation } from "expo-router";
import { ExpoSpeechRecognitionModule as speech } from "expo-speech-recognition";

type State = "idle" | "starting" | "listening" | "stopping";
type Options = {
  value: string;
  onChange: (text: string) => void;
  onSend: (text: string) => void;
  disabled?: boolean;
};

// Native recognition is process-wide; only the initiating composer owns events.
let owner: symbol | undefined;
export function useDictation(options: Options) {
  const navigation = useNavigation();
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const identity = useRef(Symbol("dictation"));
  const mounted = useRef(false);
  const generation = useRef(0);
  const base = useRef("");
  const text = useRef("");
  const sendAfterEnd = useRef(false);
  const ignoreResults = useRef(false);
  const nativeStarted = useRef(false);
  const [state, setState] = useState<State>("idle");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const owns = () => mounted.current && owner === identity.current;

  useEffect(() => {
    mounted.current = true;
    const id = identity.current;
    const interrupt = () => {
      if (!owns()) return;
      generation.current++;
      sendAfterEnd.current = false;
      ignoreResults.current = true;
      if (nativeStarted.current) speech.abort();
      else {
        owner = undefined;
        setState("idle");
      }
    };
    const removeBlur = navigation.addListener("blur", interrupt);
    const subscriptions = [
      speech.addListener("start", () => {
        if (owns()) setState("listening");
      }),
      speech.addListener("result", (event) => {
        if (!owns() || ignoreResults.current) return;
        const transcript = event.results[0]?.transcript ?? "";
        text.current = [base.current.trimEnd(), transcript]
          .filter(Boolean)
          .join(" ");
        latest.current.onChange(text.current);
      }),
      speech.addListener("volumechange", ({ value }) => {
        if (owns()) setLevel(Math.max(0, Math.min(1, value / 10)));
      }),
      speech.addListener("error", ({ error: code }) => {
        if (!owns()) return;
        sendAfterEnd.current = false;
        if (code !== "aborted")
          setError(
            code === "no-speech"
              ? "No speech heard. Try again."
              : "Dictation stopped. Your draft is saved. Try again.",
          );
      }),
      speech.addListener("end", () => {
        if (!owns()) return;
        owner = undefined;
        nativeStarted.current = false;
        setState("idle");
        setLevel(0);
        const send = sendAfterEnd.current;
        sendAfterEnd.current = false;
        if (send && !latest.current.disabled && text.current.trim())
          latest.current.onSend(text.current);
      }),
      AppState.addEventListener("change", (next) => {
        if (next === "active" || !owns() || !nativeStarted.current) return;
        interrupt();
      }),
    ];
    return () => {
      mounted.current = false;
      if (owner === id) {
        if (nativeStarted.current) {
          // Keep other composers out until the old native session has ended.
          const ended = speech.addListener("end", () => {
            if (owner === id) owner = undefined;
            ended.remove();
          });
          speech.abort();
        } else owner = undefined;
      }
      subscriptions.forEach((subscription) => subscription.remove());
      removeBlur();
    };
  }, [navigation]);

  async function start() {
    if (latest.current.disabled || owner) return;
    owner = identity.current;
    const attempt = ++generation.current;
    setState("starting");
    setError(null);
    sendAfterEnd.current = false;
    ignoreResults.current = false;
    base.current = text.current = latest.current.value;
    try {
      if (!speech.isRecognitionAvailable())
        throw new Error("Dictation is unavailable on this device.");
      const permission = await speech.requestPermissionsAsync();
      if (!owns() || attempt !== generation.current) return;
      if (AppState.currentState !== "active") {
        owner = undefined;
        setState("idle");
        return;
      }
      if (!permission.granted)
        throw new Error(
          "Allow microphone and speech recognition in Settings to dictate.",
        );
      nativeStarted.current = true;
      speech.start({
        lang: Intl.DateTimeFormat().resolvedOptions().locale,
        interimResults: true,
        continuous: false,
        addsPunctuation: true,
        iosTaskHint: "dictation",
        recordingOptions: { persist: false },
        volumeChangeEventOptions: { enabled: true, intervalMillis: 100 },
      });
    } catch (cause) {
      if (owns() && attempt === generation.current) {
        owner = undefined;
        nativeStarted.current = false;
        setState("idle");
        setError(
          cause instanceof Error
            ? cause.message
            : "Dictation could not start. Try again.",
        );
      }
    }
  }
  function stop() {
    if (!owns() || state !== "listening") return;
    setState("stopping");
    speech.stop();
  }
  function cancel() {
    if (!owns()) return;
    generation.current++;
    ignoreResults.current = true;
    sendAfterEnd.current = false;
    latest.current.onChange(base.current);
    if (!nativeStarted.current) {
      owner = undefined;
      setState("idle");
    } else {
      setState("stopping");
      speech.abort();
    }
  }
  function send() {
    if (!owns() || latest.current.disabled || state !== "listening") return;
    sendAfterEnd.current = true;
    stop();
  }
  return { state, level, error, start, stop, cancel, send };
}
