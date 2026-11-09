const original = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
    throw new Error("Remote fetch blocked");
  return original(input, { ...init, redirect: "error" });
};
