import { useConvexAuth, useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
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
import { PaymentGate, type BillingSnapshot } from "./payment-gate";
import { nextSubmissionStep } from "./submission-policy";
import { openURL } from "expo-linking";
import { examples } from "../studio/data";
import { MessageComposer } from "../studio/message-composer";
import { useAttachments } from "../studio/attachments";
import { attachmentIds } from "../studio/attachment-policy";
import { Action, Screen, Label, Touch } from "../studio/ui";
import { ErrorBoundary } from "./ui";

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
  const snapshot = useAction(api.billing.snapshot);
  const user = useQuery(api.users.index.current, {});
  const connections = useQuery(api.connections.index.status, {
    features: ["authentication"],
  });
  const handoff = useMutation(api.browserHandoff.create);
  const [phase, setPhase] = useState<"payment" | "connections" | null>(null);
  const [billing, setBilling] = useState<BillingSnapshot | null>(null);
  const c = useTheme();
  async function refreshBalance() {
    try {
      const data = await snapshot({});
      if (isActive()) setBilling(data);
    } catch {
      if (isActive()) setBilling(null);
    }
  }
  async function submit(text: string) {
    const fileIds = attachmentIds(attachments);
    if (!text.trim() || busy || attachmentsBusy || !fileIds) return;
    setBusy(true);
    setError("");
    let started = false;
    try {
      if (paymentsEnabled) {
        let data: BillingSnapshot;
        try {
          data = await snapshot({});
        } catch {
          if (isActive()) {
            setBilling(null);
            setPhase("payment");
          }
          return;
        }
        if (!isActive()) return;
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
      if (!beginSend(fileIds)) return;
      started = true;
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
    return (
      <View className="gap-[20px]">
        <ConnectionPanel
          connections={connections ? { ...connections, ready } : undefined}
          expoRequired={selected.some((p) => p === "android" || p === "ios")}
          busy={busy}
          onConnect={() =>
            void handoff({})
              .then(openURL)
              .catch(() => setError("Could not open connections."))
          }
          onProvider={() =>
            void handoff({})
              .then(openURL)
              .catch(() => setError("Could not open connections."))
          }
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
            className={`rounded-[24px] px-[18px] py-[14px] ${selected.includes(platform.id) ? "bg-foreground" : "bg-card"}`}
          >
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
