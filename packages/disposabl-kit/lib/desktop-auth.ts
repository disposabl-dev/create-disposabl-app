export const desktopAuthPath = "/oauth/desktop";

export function desktopAuthScheme(id: unknown) {
  return typeof id === "string" && /^[a-f0-9]{32}$/.test(id)
    ? `disposabl-desktop-${id}`
    : null;
}

function ticket(url: URL) {
  const code = url.searchParams.getAll("convexAuthCode");
  const error = url.searchParams.getAll("convexAuthError");
  if (code.length === 1 && !error.length && code[0] && code[0].length <= 4096)
    return { name: "convexAuthCode", value: code[0] };
  if (error.length === 1 && !code.length && error[0])
    return {
      name: "convexAuthError",
      value: error[0] === "access_denied" ? "access_denied" : "oauth_error",
    };
  return null;
}

/** The browser forwards only a one-time ticket. The initiating app retains flow state. */
export function desktopAuthRedirect(request: Request, id: unknown) {
  const scheme = desktopAuthScheme(id);
  const result = ticket(new URL(request.url));
  const headers = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  };
  if (!scheme || !result)
    return new Response("Invalid desktop sign-in response.", {
      status: 400,
      headers,
    });
  const target = new URL(`${scheme}://login`);
  target.searchParams.set(result.name, result.value);
  return new Response(null, {
    status: 302,
    headers: { ...headers, Location: target.href },
  });
}

export function desktopAuthCallback(
  input: string,
  id: unknown,
  destination: string,
) {
  try {
    const scheme = desktopAuthScheme(id);
    const url = new URL(input);
    const target = new URL(destination);
    if (
      !scheme ||
      url.protocol !== `${scheme}:` ||
      url.hostname !== "login" ||
      url.pathname ||
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      !["https:", "http:"].includes(target.protocol)
    )
      return null;
    const result = ticket(url);
    if (!result) return null;
    target.searchParams.delete("convexAuthCode");
    target.searchParams.delete("convexAuthError");
    target.searchParams.set(result.name, result.value);
    return target.href;
  } catch {
    return null;
  }
}
