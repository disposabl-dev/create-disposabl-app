import { sessionId } from "./auth-session";

export function pageCategory(pathname: string) {
  return pathname === "/"
    ? "home"
    : pathname.startsWith("/dashboard/connections")
      ? "connections"
      : pathname.startsWith("/dashboard")
        ? "dashboard"
        : pathname === "/login"
          ? "login"
          : pathname === "/signup"
            ? "signup"
            : pathname === "/account"
              ? "account"
              : "other";
}

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const storageKey = "disposabl.analytics.identity.v1";
type State = { anonymousId: string | null; session: string | null };
type Storage = {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
};
type View = {
  origin: string;
  platform: "web" | "mobile";
  page: string;
  token: string | null;
  session: string | null;
  generation: number;
};

/** One in-flight view and one latest pending view; never queues user content. */
export function createPageTelemetry(
  storage: Storage,
  transport: typeof fetch = fetch,
  exclusive: (work: () => Promise<void>) => Promise<void> = (work) => work(),
) {
  let state: State | undefined;
  let observed: string | null | undefined;
  let generation = 0;
  let appliedGeneration = 0;
  let pending: View | undefined;
  let running = false;

  async function load() {
    if (state) return;
    try {
      const value = JSON.parse((await storage.getItem(storageKey)) || "null");
      if (
        value &&
        typeof value === "object" &&
        uuid.test(value.anonymousId) &&
        (value.session === null || typeof value.session === "string")
      ) {
        state = { anonymousId: value.anonymousId, session: value.session };
      }
    } catch {
      /* Storage is optional. */
    }
    state ??= { anonymousId: null, session: null };
  }

  async function save() {
    try {
      await storage.setItem(storageKey, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  }

  async function drain() {
    if (running) return;
    running = true;
    try {
      while (pending) {
        const view = pending;
        pending = undefined;
        await exclusive(async () => {
          // Reload under the shared lock: another tab may have changed identity.
          state = undefined;
          await load();
          if (
            (state!.session !== null && state!.session !== view.session) ||
            appliedGeneration !== view.generation
          ) {
            state!.anonymousId = null;
          }
          appliedGeneration = view.generation;
          state!.session = view.session;
          // Persist the rotation before sending; a crash must not reuse an old identity.
          if (!(await save()) || view.generation !== generation) return;
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 6500);
          try {
            const response = await transport(`${view.origin}/telemetry/page`, {
              method: "POST",
              signal: controller.signal,
              headers: {
                "Content-Type": "text/plain",
                ...(view.token
                  ? { Authorization: `Bearer ${view.token}` }
                  : {}),
              },
              body: JSON.stringify({
                platform: view.platform,
                page: view.page,
                ...(state!.anonymousId && { anonymousId: state!.anonymousId }),
              }),
            });
            if (response.ok && view.generation === generation) {
              const data: unknown = await response.json();
              if (
                data &&
                typeof data === "object" &&
                "anonymousId" in data &&
                typeof data.anonymousId === "string" &&
                view.generation === generation &&
                uuid.test(data.anonymousId)
              ) {
                state!.anonymousId = data.anonymousId;
                await save();
              }
            }
          } catch {
            /* Never interrupt the app or retry indefinitely. */
          } finally {
            clearTimeout(timer);
          }
        });
      }
    } catch {
      // Lock and storage failures must not affect the app.
    } finally {
      running = false;
    }
  }

  return {
    view(
      origin: string,
      platform: "web" | "mobile",
      pathname: string,
      token: string | null,
    ) {
      const session = sessionId(token);
      if (token && !session) return;
      if (observed !== undefined && observed !== null && observed !== session)
        generation++;
      observed = session;
      pending = {
        origin,
        platform,
        page: pageCategory(pathname),
        token,
        session,
        generation,
      };
      void drain();
    },
  };
}
