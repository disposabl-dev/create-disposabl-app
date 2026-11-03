"use node";

import { generateKeyPair, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import forge from "node-forge";

export async function generateAndroidSigning() {
  const { privateKey, publicKey } = await promisify(generateKeyPair)("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const key = forge.pki.privateKeyFromPem(privateKey);
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = forge.pki.publicKeyFromPem(publicKey);
  certificate.serialNumber = `01${randomBytes(16).toString("hex")}`;
  certificate.validity.notBefore = new Date();
  certificate.validity.notAfter = new Date();
  certificate.validity.notAfter.setUTCFullYear(
    certificate.validity.notAfter.getUTCFullYear() + 30,
  );
  const subject = [{ name: "commonName", value: "Android Release" }];
  certificate.setSubject(subject);
  certificate.setIssuer(subject);
  certificate.sign(key, forge.md.sha256.create());
  const storePassword = randomBytes(32).toString("base64url");
  const keyAlias = "android-release";
  const p12 = forge.pkcs12.toPkcs12Asn1(key, [certificate], storePassword, {
    algorithm: "3des",
    friendlyName: keyAlias,
  });
  return {
    keystoreBase64: Buffer.from(
      forge.asn1.toDer(p12).getBytes(),
      "binary",
    ).toString("base64"),
    storePassword,
    keyAlias,
    keyPassword: storePassword,
  };
}
