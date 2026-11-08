import { lock } from "proper-lockfile";
import manifest from "./package.json";
import {
  auth,
  type OAuthClientProvider,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  rm,
  chmod,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

export function openUrl(url: string) {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "rundll32"
        : "xdg-open";
  const args =
    process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  const child = spawn(command, args, { stdio: "ignore" });
  child.on("error", () => console.error("Open the URL manually."));
  child.unref();
}

export class NotAuthenticated extends Error {}

type Session = {
  client?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  expiresAt?: number;
  redirectUrl?: string;
};
const directory = () =>
  process.env.DISPOSABL_CONFIG_DIR || join(homedir(), ".config", "disposabl");
const sessionPath = (url: string) =>
  join(directory(), `${createHash("sha256").update(url).digest("hex")}.json`);
export { apiUrl } from "./origin";
const fetchFor = (origin: string): typeof fetch =>
  Object.assign(
    async (
      input: string | URL | Request,
      init?: Parameters<typeof fetch>[1],
    ) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.origin !== origin)
        throw new Error(
          "OAuth endpoint must belong to the configured API origin.",
        );
      return fetch(input, {
        ...init,
        redirect: "error",
        signal: init?.signal ?? AbortSignal.timeout(30_000),
      });
    },
    {
      preconnect: (fetch as typeof fetch & { preconnect?: unknown }).preconnect,
    },
  ) as typeof fetch;
async function load(url: string): Promise<Session> {
  try {
    return JSON.parse(await readFile(sessionPath(url), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}
async function save(url: string, session: Session) {
  await mkdir(directory(), { recursive: true, mode: 0o700 });
  await chmod(directory(), 0o700);
  const temporary = `${sessionPath(url)}.${randomBytes(8).toString("hex")}`;
  try {
    await writeFile(temporary, JSON.stringify(session), {
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporary, sessionPath(url));
  } finally {
    await rm(temporary, { force: true });
  }
}
function provider(
  url: string,
  session: Session,
  redirect: (url: URL) => void,
  state?: string,
): OAuthClientProvider {
  let verifier = "";
  return {
    redirectUrl: session.redirectUrl,
    clientMetadata: {
      client_name: `${Object.keys(manifest.bin)[0]} CLI`,
      redirect_uris: session.redirectUrl ? [session.redirectUrl] : [],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    state: () => state ?? "",
    clientInformation: () => session.client,
    saveClientInformation: (client) => {
      session.client = client;
    },
    tokens: () => session.tokens,
    saveTokens: async (tokens) => {
      session.tokens = tokens;
      session.expiresAt = tokens.expires_in
        ? Date.now() + tokens.expires_in * 1000
        : 0;
      await save(url, session);
    },
    saveCodeVerifier: (value) => {
      verifier = value;
    },
    codeVerifier: () => verifier,
    redirectToAuthorization: redirect,
    invalidateCredentials: async (scope) => {
      if (scope === "all" || scope === "tokens") {
        delete session.tokens;
        delete session.expiresAt;
      }
      if (scope === "all" || scope === "client") delete session.client;
      if (scope === "all" || scope === "verifier") verifier = "";
      await save(url, session);
    },
  };
}
async function unlockedLogin(url: string, openBrowser = true) {
  const state = randomBytes(32).toString("base64url");
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Could not bind the login callback.");
  const session: Session = {
    redirectUrl: `http://127.0.0.1:${address.port}/callback`,
  };
  const oauth = provider(
    url,
    session,
    (authorizationUrl) => {
      if (authorizationUrl.origin !== url)
        throw new Error("Unexpected authorization server.");
      console.error(`Open this URL to sign in:\n${authorizationUrl.href}`);
      if (openBrowser) openUrl(authorizationUrl.href);
    },
    state,
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const callback = new Promise<void>((resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error("Login timed out. Start login again.")),
        300_000,
      );
      server.on("request", async (request, response) => {
        const callbackUrl = new URL(request.url ?? "/", session.redirectUrl);
        const invalid =
          request.method !== "GET" ||
          request.headers.host !== `127.0.0.1:${address.port}` ||
          callbackUrl.pathname !== "/callback" ||
          callbackUrl.searchParams.getAll("state").length !== 1 ||
          callbackUrl.searchParams.get("state") !== state;
        if (invalid) {
          response.writeHead(400).end("Invalid login callback.");
          return;
        }
        try {
          if (callbackUrl.searchParams.get("iss")?.replace(/\/$/, "") !== url)
            throw new Error("Unexpected OAuth issuer.");
          const code = callbackUrl.searchParams.get("code");
          if (
            !code ||
            callbackUrl.searchParams.getAll("code").length !== 1 ||
            callbackUrl.searchParams.has("error")
          )
            throw new Error("Login was not approved.");
          const result = await auth(oauth, {
            serverUrl: `${url}/mcp`,
            authorizationCode: code,
            fetchFn: fetchFor(url),
          });
          if (result !== "AUTHORIZED")
            throw new Error("Login did not complete.");
          response
            .writeHead(200, {
              "Content-Type": "text/plain",
              "Cache-Control": "no-store",
            })
            .end("Signed in. You can close this tab.");
          resolve();
        } catch (error) {
          response.writeHead(400).end("Login failed. Return to your terminal.");
          reject(error);
        }
      });
    });
    // Attach a rejection handler before discovery can fail or the timer fires.
    void callback.catch(() => {});
    await auth(oauth, { serverUrl: `${url}/mcp`, fetchFn: fetchFor(url) });
    await callback;
  } finally {
    clearTimeout(timer);
    server.closeAllConnections();
    server.close();
  }
}
async function unlockedAccessToken(url: string, forceRefresh = false) {
  if (process.env.DISPOSABL_API_KEY) return process.env.DISPOSABL_API_KEY;
  const session = await load(url);
  if (!session.tokens)
    throw new NotAuthenticated("Run login first, or set DISPOSABL_API_KEY.");
  if (
    forceRefresh ||
    !session.expiresAt ||
    Date.now() >= session.expiresAt - 30_000
  ) {
    if (!session.client || !session.tokens.refresh_token)
      throw new NotAuthenticated(
        "Session cannot be renewed. Sign in again or start a newly authorized agent run.",
      );
    const oauth = provider(url, session, () => {
      throw new NotAuthenticated("Session expired. Run login again.");
    });
    await auth(oauth, { serverUrl: `${url}/mcp`, fetchFn: fetchFor(url) });
  }
  if (!session.tokens)
    throw new NotAuthenticated("Session expired. Run login again.");
  return session.tokens.access_token;
}
async function unlockedLogout(url: string) {
  const session = await load(url);
  if (session.tokens) {
    for (const token of [
      session.tokens.refresh_token,
      session.tokens.access_token,
    ].filter(Boolean)) {
      const response = await fetchFor(url)(`${url}/mcp/oauth/revoke`, {
        method: "POST",
        body: new URLSearchParams({
          token: token!,
          client_id: session.client?.client_id ?? "",
        }),
      });
      if (!response.ok)
        throw new Error(
          "Revocation failed; credentials retained so logout can be retried.",
        );
    }
  }
  await rm(sessionPath(url), { force: true });
}

async function withCredentials<T>(
  url: string,
  operation: () => Promise<T>,
): Promise<T> {
  await mkdir(directory(), { recursive: true, mode: 0o700 });
  const release = await lock(sessionPath(url), {
    realpath: false,
    stale: 10000,
    retries: { retries: 8, minTimeout: 100, maxTimeout: 1000 },
  });
  try {
    return await operation();
  } finally {
    await release();
  }
}
export function withCredentialSession<T>(
  url: string,
  operation: (session: {
    login: (browser?: boolean) => Promise<void>;
    logout: () => Promise<void>;
    hasCredentials: () => Promise<boolean>;
    accessToken: (refresh?: boolean) => Promise<string>;
    loginAccessToken: () => Promise<string | undefined>;
  }) => Promise<T>,
): Promise<T> {
  return withCredentials(url, () =>
    operation({
      login: (browser) => unlockedLogin(url, browser),
      logout: () => unlockedLogout(url),
      hasCredentials: () => hasCredentials(url),
      accessToken: (refresh) => unlockedAccessToken(url, refresh),
      loginAccessToken: () => loginAccessToken(url),
    }),
  );
}
export const login = (url: string, browser = true) =>
  withCredentials(url, () => unlockedLogin(url, browser));
export const accessToken = (url: string, refresh = false) =>
  withCredentials(url, () => unlockedAccessToken(url, refresh));
export const logout = (url: string) =>
  withCredentials(url, () => unlockedLogout(url));

export const hasCredentials = async (url: string) =>
  Boolean(
    process.env.DISPOSABL_API_KEY || (await load(url)).tokens?.access_token,
  );

// A freshly completed login has already stored its token; do not refresh it for telemetry.
export const loginAccessToken = async (url: string) =>
  (await load(url)).tokens?.access_token;
