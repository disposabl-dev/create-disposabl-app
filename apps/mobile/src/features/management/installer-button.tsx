import { useAuthToken } from "@convex-dev/auth/react";
import { useAction } from "convex/react";
import { useLayoutEffect, useRef, useState } from "react";
import { Linking, Text, View } from "react-native";
import { platforms, type Platform } from "@disposabl/disposabl-kit/platforms";
import { sessionId } from "../../../../../packages/disposabl-kit/lib/auth-session";
import { api } from "../../../../../packages/backend/convex/_generated/api";
import { Button } from "./ui";

type Props = {
  appId: string;
  platform: Platform;
  reference?: string;
  releaseKey: string;
};

export function InstallerButton(props: Props) {
  const session = sessionId(useAuthToken());
  return session ? (
    <Download key={JSON.stringify([session, props])} {...props} />
  ) : null;
}

function Download({ appId, platform, reference }: Props) {
  const resolve = useAction(api.downloads.index.installer);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(false);
  const pending = useRef(false);
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function download() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const url = await resolve({
        appId,
        platform,
        ...(reference !== undefined ? { reference } : {}),
      });
      if (!url) throw new Error("Installer unavailable");
      if (active.current) await Linking.openURL(url);
    } catch {
      if (active.current)
        setError("Could not open the installer. Please try again.");
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  return (
    <View className="gap-[8px]">
      <Button
        title={
          busy
            ? "Preparing download…"
            : `Download ${platforms.find((item) => item.id === platform)?.label ?? platform}`
        }
        disabled={busy}
        onPress={() => void download()}
      />
      {!!error && (
        <Text
          accessibilityRole="alert"
          className="text-[16px] leading-[23px] text-foreground"
        >
          {error}
        </Text>
      )}
    </View>
  );
}
