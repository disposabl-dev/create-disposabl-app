// In-memory provider fixture, isolated to loopback. No payment calls or credentials.
type State = {
  code: string;
  user: string;
  purchase: "monthly" | "topup";
  expiresAt: number;
  used: boolean;
  returnChannel?: string;
  returnExpiresAt?: number;
  balance: number;
  monthly: boolean;
  mode: string;
  attempts: { user: string; purchase: string; requestId: string }[];
  portalCalls: string[];
  portalCompleted: number;
  holdPortal?: boolean;
};
let state: State;
let releasePortal: (() => void) | undefined;
const headers = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};
Bun.serve({
  hostname: "127.0.0.1",
  port: 3451,
  async fetch(req) {
    if (req.method === "OPTIONS") return new Response(null, { headers });
    const url = new URL(req.url);
    if (url.pathname === "/reset") {
      state = await req.json();
      state.used = false;
      state.attempts = [];
      state.portalCalls = [];
      state.portalCompleted = 0;
      return Response.json({ ok: true }, { headers });
    }
    if (url.pathname === "/state") return Response.json(state, { headers });
    if (url.pathname === "/update") {
      const update = await req.json();
      Object.assign(state, update);
      if (update.releasePortal) {
        releasePortal?.();
        releasePortal = undefined;
      }
      return Response.json({ ok: true }, { headers });
    }
    if (url.pathname !== "/call")
      return new Response("not found", { status: 404, headers });
    const { name, args, user } = await req.json();
    if (name === "billingHandoff:inspect")
      return Response.json(
        args.code === state.code && !state.used && state.expiresAt > Date.now()
          ? { name: "@alice" }
          : null,
        { headers },
      );
    if (name === "billingHandoff:redeem") {
      if (
        args.code !== state.code ||
        state.used ||
        state.expiresAt <= Date.now()
      )
        return new Response("expired", { status: 400, headers });
      state.used = true;
      return Response.json(
        {
          userId: state.user,
          accessToken: "fixture",
          refreshToken: "fixture",
          refreshTokenExpiresAt: state.expiresAt,
          purchase: state.purchase,
          expiresAt: state.expiresAt,
          returnClaim: state.returnChannel ? args.code : null,
        },
        { headers },
      );
    }
    if (name === "billingHandoff:returnTarget") {
      const valid =
        state.used &&
        args.code === state.code &&
        user === state.user &&
        ["production", "preview"].includes(state.returnChannel ?? "") &&
        (state.returnExpiresAt ?? 0) > Date.now();
      return Response.json(
        valid
          ? {
              url: `disposabl-billing-97f7be92f4c3-${state.returnChannel}://billing-return`,
              expiresAt: state.returnExpiresAt,
            }
          : null,
        { headers },
      );
    }
    if (name === "billing:snapshot") {
      if (state.mode === "snapshot-denied")
        return new Response("account unavailable", { status: 403, headers });
      return Response.json(
        {
          customerId: user,
          balance: state.balance,
          hasMonthlyPlan: state.monthly,
          checkoutNeedsReview: state.mode === "unknown",
        },
        { headers },
      );
    }
    if (name === "billing:portal") {
      state.portalCalls.push(user);
      if (state.holdPortal)
        await new Promise<void>((resolve) => {
          releasePortal = resolve;
        });
      state.portalCompleted++;
      return Response.json(
        { url: "http://127.0.0.1:3450/portal" },
        { headers },
      );
    }
    if (name === "billing:checkout") {
      state.attempts.push({ user, ...args });
      if (state.mode === "unknown")
        return new Response("unknown", { status: 503, headers });
      if (state.mode === "closed")
        return Response.json({ url: null, retryAllowed: true }, { headers });
      if (state.mode === "pending")
        return Response.json({ url: null }, { headers });
      return Response.json(
        { url: "http://127.0.0.1:3450/checkout" },
        { headers },
      );
    }
    return new Response("unknown function", { status: 404, headers });
  },
});
