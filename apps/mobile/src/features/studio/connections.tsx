import { router, useLocalSearchParams } from "expo-router";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuthToken } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { openBrowserAsync } from "expo-web-browser";
import { mobileConnectionReturnUrl } from "../../../../../packages/backend/convex/connections/mobile";
import { useNativeConnections } from "./use-native-connections";
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
  native?: ReturnType<typeof useNativeConnections>;
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
  const native = useNativeConnections();
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
        native,
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
  const { required, connections, complete, native } = useContext(Context);
  if (!native) return children;
  if (!required && !always) return children;
  return (
    <View style={{ gap: 20 }}>
      <ConnectionPanel
        connections={connections}
        busy={native.busy}
        onConnect={() =>
          void native.connect(connections?.github ? "convex" : "github")
        }
        onProvider={(provider) => {
          if (provider === "expo")
            void openBrowserAsync(connections!.connectionsUrl);
          else void native.connect(provider);
        }}
        onManage={() => void openBrowserAsync(connections!.connectionsUrl)}
        onContinue={() => {
          complete();
          if (always) router.replace("/compose");
        }}
      />
      {native.installNeeded && (
        <Touch
          label="Install Disposabl on GitHub"
          onPress={() => void native.connect("github", true)}
        >
          <Label>Install Disposabl on GitHub ↗</Label>
        </Touch>
      )}
      {native.installations.map((account) => (
        <Touch
          key={account.installationId}
          label={`Use GitHub account ${account.owner}`}
          onPress={() => void native.select(account.installationId)}
        >
          <Label>{account.owner}</Label>
        </Touch>
      ))}
      {!!native.error && <Label>{native.error}</Label>}
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
        style={{ padding: 20, gap: 18 }}
      >
        <View
          style={{
            flexDirection: stacked ? "column" : "row",
            alignItems: stacked ? "stretch" : "center",
            gap: 16,
          }}
        >
          <View style={{ flexDirection: "row", gap: 6 }}>
            <ProviderMark provider="github" />
            <ProviderMark provider="convex" />
          </View>
          <View style={{ flex: stacked ? undefined : 1, gap: 4 }}>
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
  const params = useLocalSearchParams<Record<string, string>>();
  const { native } = useContext(Context);
  const state = params.state;
  const provider = params.provider;
  const code = params.code;
  const installation = params.installation_id;
  const setup = params.setup_action;
  const error = params.error;
  const accept = native?.acceptCallback;
  useEffect(() => {
    if (!state || !accept) return;
    const url = new URL(mobileConnectionReturnUrl);
    for (const [key, value] of Object.entries({
      state,
      provider,
      code,
      installation_id: installation,
      setup_action: setup,
      error,
    }))
      if (typeof value === "string") url.searchParams.set(key, value);
    router.setParams({
      state: undefined,
      provider: undefined,
      code: undefined,
      installation_id: undefined,
      setup_action: undefined,
      error: undefined,
    });
    void accept(url.href);
  }, [state, provider, code, installation, setup, error, accept]);
  return (
    <Screen title="Your connections">
      <ConnectionGate always>{null}</ConnectionGate>
    </Screen>
  );
}
