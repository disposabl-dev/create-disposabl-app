import { router } from "expo-router";
import { captureProductAction } from "../product-telemetry";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuthToken } from "@convex-dev/auth/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { openURL } from "expo-linking";
import { View } from "react-native";
import { authenticationEnabled } from "@disposabl/disposabl-kit/features";
import { sessionId } from "../../../../../packages/disposabl-kit/lib/auth-session";
import { api } from "../../../../../packages/backend/convex/_generated/api";
import { Label, Screen } from "./ui";
import { SessionCurrentContext } from "./session-current";
import { ConnectionPanel } from "./connection-panel";

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
  const current = useRef(session);
  useLayoutEffect(() => {
    current.current = session;
  }, [session]);
  return (
    <SessionCurrentContext.Provider
      value={() => !!session && current.current === session}
    >
      <SessionState key={session ?? "anonymous"}>{children}</SessionState>
    </SessionCurrentContext.Provider>
  );
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
    captureProductAction("open_connections");
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

export function ConnectionsScreen() {
  return (
    <Screen title="Your connections">
      <ConnectionGate always>{null}</ConnectionGate>
    </Screen>
  );
}
