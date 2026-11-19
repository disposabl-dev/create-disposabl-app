import { createSign } from "node:crypto";

export function createAppleClient({ keyId, issuerId, privateKey }) {
  if (![keyId, issuerId, privateKey].every(Boolean))
    throw new Error("Missing App Store Connect API credentials");
  const ASC_KEY_ID = keyId,
    ASC_ISSUER_ID = issuerId,
    ASC_PRIVATE_KEY = privateKey;
  const encoded = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encoded({ alg: "ES256", kid: ASC_KEY_ID, typ: "JWT" })}.${encoded({ iss: ASC_ISSUER_ID, iat: now, exp: now + 1200, aud: "appstoreconnect-v1" })}`;
  const signer = createSign("SHA256");
  signer.update(unsigned);
  const token = `${unsigned}.${signer.sign({ key: ASC_PRIVATE_KEY, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
  const origin = "https://api.appstoreconnect.apple.com";
  async function request(path, method = "GET", data) {
    const url = new URL(path, origin);
    if (url.origin !== origin) throw new Error("Unexpected API origin");
    const response = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      ...(data ? { body: JSON.stringify({ data }) } : {}),
    });
    if (!response.ok)
      throw new Error(
        `App Store Connect ${method} ${url.pathname} failed (${response.status}): ${await response.text()}`,
      );
    return response.status === 204 ? {} : response.json();
  }
  async function list(path) {
    const items = [];
    while (path) {
      const page = await request(path);
      items.push(...page.data);
      path = page.links?.next;
    }
    return items;
  }
  return { request, list };
}
