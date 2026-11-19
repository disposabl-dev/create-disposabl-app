import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useConvexAuth, useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { api } from "../../../../../packages/backend/convex/_generated/api";
import {
  platforms,
  resolvePlatforms,
  type Platform,
} from "@disposabl/disposabl-kit/platforms";
import {
  authenticationEnabled,
  paymentsEnabled,
} from "@disposabl/disposabl-kit/features";
import { useTheme } from "../../../../../packages/disposabl-kit/mobile/design/use-theme";
import { ConnectionPanel } from "../studio/connection-panel";
import { captureProductAction } from "../product-telemetry";
import { PaymentGate, type BillingSnapshot } from "./payment-gate";
import { nextSubmissionStep } from "./submission-policy";
import { openURL } from "expo-linking";
import { examples } from "../studio/data";
import { MessageComposer } from "../studio/message-composer";
import { useAttachments } from "../studio/attachments";
import { attachmentIds } from "../studio/attachment-policy";
import { Action, Screen, Label, Touch } from "../studio/ui";
import { ErrorBoundary } from "./ui";
import { useAiConsent } from "./ai-safety";

const platformIcons = {
  web: "web",
  android: "android",
  ios: "apple",
  macos: "apple",
  windows: "microsoft-windows",
  linux: "linux",
  api: "api",
  cli: "console",
  "typescript-sdk": "language-typescript",
} as const satisfies Record<
  Exclude<Platform, "mcp">,
  React.ComponentProps<typeof MaterialCommunityIcons>["name"]
>;

export function ManagementHome() {
  return (
    <ErrorBoundary>
      <Screen title="Create app">
        {authenticationEnabled ? (
          <ComposeEntry />
        ) : (
          <Label>App creation requires authentication.</Label>
        )}
      </Screen>
    </ErrorBoundary>
  );
}

function ComposeEntry() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { exampleSlug } = useLocalSearchParams<{ exampleSlug?: string }>();
  if (isLoading)
    return <ActivityIndicator accessibilityLabel="Loading session" />;
  if (!isAuthenticated)
    return (
      <View className="gap-[24px]">
        <Label variant="title">Let’s make your idea real.</Label>
        <Label>Sign in to create an app in your own accounts.</Label>
        <Action
          label="Sign in to create"
          onPress={() =>
            router.push({
              pathname: "/(auth)/login",
              params: {
                returnTo: exampleSlug
                  ? `/compose?exampleSlug=${encodeURIComponent(exampleSlug)}`
                  : "/compose",
              },
            })
          }
        />
      </View>
    );
  return <Composer />;
}

function Composer() {
  const {
    attachments,
    beginSend,
    markSent,
    sendFailed,
    isActive,
    pick,
    retry,
    remove,
    busy: attachmentsBusy,
  } = useAttachments();
  const { exampleSlug } = useLocalSearchParams<{ exampleSlug?: string }>();
  const example = examples.find((app) => app.slug === exampleSlug);
  const [prompt, setPrompt] = useState(example?.prompt ?? "");
  const [selected, setSelected] = useState<Platform[]>(
    example?.targets ?? ["web"],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const send = useAction(api.agent.index.sendMessageChecked);
  const consent = useAiConsent();
  const snapshot = useAction(api.billing.snapshot);
  const user = useQuery(api.users.index.current, {});
  const connections = useQuery(api.connections.index.status, {
    features: ["authentication"],
  });
  const handoff = useMutation(api.browserHandoff.create);
  const [phase, setPhase] = useState<"payment" | "connections" | null>(null);
  const [billing, setBilling] = useState<BillingSnapshot | null>(null);
  const billingSequence = useRef(0);
  const c = useTheme();
  async function refreshBalance() {
    const sequence = ++billingSequence.current;
    try {
      const data = await snapshot({});
      if (isActive() && sequence === billingSequence.current) {
        setBilling(data);
        return data.balance;
      }
    } catch {
      if (isActive() && sequence === billingSequence.current) setBilling(null);
    }
    return null;
  }
  async function submit(text: string) {
    const fileIds = attachmentIds(attachments);
    if (!text.trim() || busy || attachmentsBusy || !fileIds) return;
    if (consent.allowed === undefined) return;
    setBusy(true);
    setError("");
    let started = false;
    try {
      if (paymentsEnabled) {
        const sequence = ++billingSequence.current;
        let data: BillingSnapshot;
        try {
          data = await snapshot({});
        } catch {
          if (isActive() && sequence === billingSequence.current) {
            setBilling(null);
            setPhase("payment");
          }
          return;
        }
        if (!isActive() || sequence !== billingSequence.current) return;
        setBilling(data);
        if (
          nextSubmissionStep(true, data.balance, true, false, false) ===
          "payment"
        ) {
          setPhase("payment");
          return;
        }
      }
      const mobile = selected.some((p) => p === "android" || p === "ios");
      if (
        nextSubmissionStep(
          false,
          null,
          !!connections?.ready,
          mobile,
          !!connections?.expo,
        ) === "connections"
      ) {
        setPhase("connections");
        return;
      }
      if (!(await consent.confirm(isActive)) || !isActive()) return;
      if (!beginSend(fileIds)) return;
      started = true;
      captureProductAction("agent_send_attempt");
      const result = await send({
        prompt: text.trim(),
        ...(fileIds.length ? { fileIds } : {}),
        platforms: resolvePlatforms(selected),
        features: ["authentication"],
      });
      markSent(fileIds);
      if (!isActive()) return;
      router.replace({
        pathname: "/(authenticated)/apps/[appId]",
        params: { appId: result.appId },
      });
    } catch (e) {
      if (started) sendFailed(fileIds, e instanceof ConvexError);
      if (isActive()) {
        const code =
          e instanceof ConvexError && typeof e.data === "object" && e.data
            ? e.data.code
            : undefined;
        if (code === "credits_required" || code === "credits_unavailable") {
          await refreshBalance();
          setPhase("payment");
        } else if (code === "connections_required") setPhase("connections");
        else
          setError(
            e instanceof Error ? e.message : "Could not send your idea.",
          );
      }
    } finally {
      if (isActive()) setBusy(false);
    }
  }
  if (phase === "payment")
    return user ? (
      <PaymentGate
        customerId={user.id}
        data={billing}
        refresh={refreshBalance}
        proceed={() => void submit(prompt)}
        cancel={() => setPhase(null)}
      />
    ) : (
      <ActivityIndicator accessibilityLabel="Loading account" />
    );
  if (phase === "connections") {
    const ready =
      !!connections?.ready &&
      (!selected.some((p) => p === "android" || p === "ios") ||
        !!connections.expo);
    const openConnections = () => {
      captureProductAction("open_connections");
      void handoff({
        mobile: selected.some((p) => p === "android" || p === "ios"),
      })
        .then(openURL)
        .catch(() => setError("Could not open connections."));
    };
    return (
      <View className="gap-[20px]">
        <ConnectionPanel
          connections={connections ? { ...connections, ready } : undefined}
          expoRequired={selected.some((p) => p === "android" || p === "ios")}
          busy={busy}
          onConnect={openConnections}
          onProvider={openConnections}
          onContinue={() => void submit(prompt)}
        />
        <Action label="Back to idea" onPress={() => setPhase(null)} />
        {!!error && (
          <Text accessibilityRole="alert" className="text-destructive">
            {error}
          </Text>
        )}
      </View>
    );
  }
  return (
    <View className="gap-[28px]">
      <Label variant="display">What will you build?</Label>
      <Label color={c.mutedForeground}>
        A thought, a tool, a little corner of the internet.
      </Label>
      <MessageComposer
        attachments={attachments}
        onPickAttachment={(source) => void pick(source)}
        onRemoveAttachment={(index) => void remove(attachments[index])}
        onRetryAttachment={(index) => void retry(attachments[index])}
        attachmentsBusy={attachmentsBusy}
        value={prompt}
        onChange={setPrompt}
        onSend={(text) => void submit(text)}
        disabled={busy}
        sending={busy}
      />
      <Label variant="heading">Make it available on</Label>
      <View className="flex-row flex-wrap gap-[10px]">
        {platforms.map((platform) => (
          <Touch
            key={platform.id}
            label={platform.label}
            selected={selected.includes(platform.id)}
            onPress={() => {
              if (platform.id === "web") return;
              setSelected((current) =>
                current.includes(platform.id)
                  ? current.filter((p) => p !== platform.id)
                  : [...current, platform.id],
              );
            }}
            className={`flex-row items-center gap-[8px] rounded-[24px] px-[18px] py-[14px] ${selected.includes(platform.id) ? "bg-foreground" : "bg-card"}`}
          >
            {platform.id === "mcp" ? (
              <Svg width={18} height={18} viewBox="0 0 24 24">
                <Path
                  fill={
                    selected.includes(platform.id) ? c.background : c.foreground
                  }
                  d="M13.85 0a4.16 4.16 0 0 0-2.95 1.217L1.456 10.66a.835.835 0 0 0 0 1.18.835.835 0 0 0 1.18 0l9.442-9.442a2.49 2.49 0 0 1 3.541 0 2.49 2.49 0 0 1 0 3.541L8.59 12.97l-.1.1a.835.835 0 0 0 0 1.18.835.835 0 0 0 1.18 0l.1-.098 7.03-7.034a2.49 2.49 0 0 1 3.542 0l.049.05a2.49 2.49 0 0 1 0 3.54l-8.54 8.54a1.96 1.96 0 0 0 0 2.755l1.753 1.753a.835.835 0 0 0 1.18 0 .835.835 0 0 0 0-1.18l-1.753-1.753a.266.266 0 0 1 0-.394l8.54-8.54a4.185 4.185 0 0 0 0-5.9l-.05-.05a4.16 4.16 0 0 0-2.95-1.218c-.2 0-.401.02-.6.048a4.17 4.17 0 0 0-1.17-3.552A4.16 4.16 0 0 0 13.85 0m0 3.333a.84.84 0 0 0-.59.245L6.275 10.56a4.186 4.186 0 0 0 0 5.902 4.186 4.186 0 0 0 5.902 0L19.16 9.48a.835.835 0 0 0 0-1.18.835.835 0 0 0-1.18 0l-6.985 6.984a2.49 2.49 0 0 1-3.54 0 2.49 2.49 0 0 1 0-3.54l6.983-6.985a.835.835 0 0 0 0-1.18.84.84 0 0 0-.59-.245"
                />
              </Svg>
            ) : (
              <MaterialCommunityIcons
                name={platformIcons[platform.id]}
                size={18}
                color={
                  selected.includes(platform.id) ? c.background : c.foreground
                }
              />
            )}
            <Text
              className={`text-[15px] ${selected.includes(platform.id) ? "text-background" : "text-foreground"}`}
            >
              {platform.label}
            </Text>
          </Touch>
        ))}
      </View>
      <Label variant="caption" color={c.mutedForeground}>
        Every app includes a website for essentials and access.
      </Label>
      {!!error && (
        <Text accessibilityRole="alert" className="text-destructive">
          {error}
        </Text>
      )}
    </View>
  );
}
