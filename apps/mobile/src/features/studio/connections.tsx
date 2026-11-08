import { router } from "expo-router";
import { createContext, useContext, useState, type ReactNode } from "react";
import { useAuthToken } from "@convex-dev/auth/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { openURL } from "expo-linking";
import { View, useWindowDimensions } from "react-native";
import { authenticationEnabled } from "@disposabl/disposabl-kit/features";
import { sessionId } from "../../../../../packages/disposabl-kit/lib/auth-session";
import { api } from "../../../../../packages/backend/convex/_generated/api";
import { Label, GlassSurface, Touch, Icon, Screen } from "./ui";
import { ConnectionPanel, ProviderMark } from "./connection-panel";
import { useTheme } from "../../../../../packages/disposabl-kit/mobile/design/use-theme";

type Connections = typeof api.connections.index.status._returnType;
const Context = createContext<{
  required: boolean;
  connections?: Connections;
  complete: () => void;
}>({ required: false, complete: () => {} });

export function ConnectionProvider({ children }: { children: ReactNode }) {
  return authenticationEnabled ? (
    <SessionConnections>{children}</SessionConnections>
  ) : (
    children
  );
}

function SessionConnections({ children }: { children: ReactNode }) {
  const session = sessionId(useAuthToken());
  return <SessionState key={session ?? "anonymous"}>{children}</SessionState>;
}

function SessionState({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const session = sessionId(useAuthToken());
  const [seen, setSeen] = useState<string | null>(null);
  const connections = useQuery(
    api.connections.index.status,
    isAuthenticated && session ? {} : "skip",
  );
  return (
    <Context.Provider
      value={{
        required:
          isAuthenticated &&
          (!session || seen !== session || !connections?.ready),
        connections,
        complete: () => {
          if (connections?.ready && session) setSeen(session);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function ConnectionGate({
  children,
  always = false,
}: {
  children: ReactNode;
  always?: boolean;
}) {
  if (!authenticationEnabled) return children;
  return (
    <AuthenticatedConnectionGate always={always}>
      {children}
    </AuthenticatedConnectionGate>
  );
}

function AuthenticatedConnectionGate({
  children,
  always,
}: {
  children: ReactNode;
  always: boolean;
}) {
  const { required, connections, complete } = useContext(Context);
  const createHandoff = useMutation(api.browserHandoff.create);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function openConnections() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await openURL(await createHandoff({}));
    } catch {
      setError("Could not open connections. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  if (!required && !always) return children;
  return (
    <View className="gap-[20px]">
      <ConnectionPanel
        connections={connections ?? undefined}
        busy={busy}
        onConnect={() => void openConnections()}
        onProvider={() => void openConnections()}
        onManage={() => void openConnections()}
        onContinue={() => {
          complete();
          if (always) router.replace("/compose");
        }}
      />
      {!!error && <Label>{error}</Label>}
    </View>
  );
}

export function ConnectionNotice() {
  const { required, connections } = useContext(Context);
  const c = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 420 || fontScale > 1.2;
  if (!required) return null;
  return (
    <GlassSurface>
      <Touch
        label="Set up your workspace"
        onPress={() => router.push("/connections")}
        className="p-[20px] gap-[18px]"
      >
        <View
          className={`gap-[16px] ${stacked ? "flex-col items-stretch" : "flex-row items-center"}`}
        >
          <View className="flex-row gap-[6px]">
            <ProviderMark provider="github" />
            <ProviderMark provider="convex" />
          </View>
          <View className={`gap-[4px] ${stacked ? "" : "flex-1"}`}>
            <Label variant="heading">
              {connections?.ready
                ? "Ready when you are"
                : "Set up your workspace"}
            </Label>
            <Label variant="caption" color={c.mutedForeground}>
              {connections?.ready
                ? "Your accounts are connected."
                : "Connect your accounts to start building."}
            </Label>
          </View>
          <Icon name="chevron" size={17} />
        </View>
      </Touch>
    </GlassSurface>
  );
}

export function ConnectionsScreen() {
  return (
    <Screen title="Your connections">
      <ConnectionGate always>{null}</ConnectionGate>
    </Screen>
  );
}
