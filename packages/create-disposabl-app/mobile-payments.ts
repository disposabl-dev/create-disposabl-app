import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join, sep } from "node:path";

export const nativeBillingPath =
  join("packages", "disposabl-kit", "mobile", "billing") + sep;
export const nativeBillingTests = [
  join("packages", "tests", "native-billing.test.ts"),
  join("packages", "tests", "mobile-storefront-observer.test.ts"),
  join("packages", "tests", "components", "mobile-storefront-observer.test.mjs"),
];
export const purchasesPackage = "react-native-purchases";
const purchasesPackages = [purchasesPackage, "react-native-purchases-ui"];
const dependencyFields = [
  "dependencies",
  "peerDependencies",
  "peerDependenciesMeta",
];

/** Merge only the SDK selection, preserving unrelated application dependencies. */
export function mergePurchasesManifest(
  prior: Buffer,
  next: Buffer,
  current: Buffer,
) {
  const before = JSON.parse(prior.toString());
  const after = JSON.parse(next.toString());
  const actual = JSON.parse(current.toString());
  const withoutSdk = (value: typeof before) => {
    const copy = structuredClone(value);
    for (const field of dependencyFields)
      for (const name of purchasesPackages) delete copy[field]?.[name];
    return JSON.stringify(copy);
  };
  if (withoutSdk(before) !== withoutSdk(after)) return undefined;
  for (const field of dependencyFields)
    for (const name of purchasesPackages) {
      const oldValue = before[field]?.[name];
      const newValue = after[field]?.[name];
      const currentValue = actual[field]?.[name];
      if (JSON.stringify(oldValue) === JSON.stringify(newValue)) continue;
      if (
        JSON.stringify(currentValue) !== JSON.stringify(oldValue) &&
        JSON.stringify(currentValue) !== JSON.stringify(newValue)
      )
        throw new Error(
          `Cannot reconfigure: customized ${name} ${field}. No files were changed.`,
        );
      if (newValue === undefined) delete actual[field]?.[name];
      else (actual[field] ??= {})[name] = newValue;
    }
  return Buffer.from(JSON.stringify(actual, null, 2) + "\n");
}

/** Remove the native billing example and SDK from a payments-off staging copy. */
export async function omitMobilePayments(root: string) {
  for (const name of ["apps/mobile", "packages/disposabl-kit"]) {
    const path = join(root, name, "package.json");
    if (!existsSync(path)) continue;
    const manifest = JSON.parse(await readFile(path, "utf8"));
    for (const field of dependencyFields)
      if (manifest[field])
        for (const name of purchasesPackages) delete manifest[field][name];
    await writeFile(path, JSON.stringify(manifest, null, 2) + "\n");
  }
  const path = join(root, "packages/disposabl-kit/mobile/screens/account.tsx");
  const source = await readFile(path, "utf8");
  await writeFile(
    path,
    source
      .replace(
        /^[ \t]*\/\/ payments:start\r?\n[\s\S]*?^[ \t]*\/\/ payments:end\r?\n/gm,
        "",
      )
      .replace(
        /^[ \t]*\{\/\* payments:start \*\/\}\r?\n[\s\S]*?^[ \t]*\{\/\* payments:end \*\/\}\r?\n/gm,
        "",
      ),
  );
  await rm(join(root, nativeBillingPath), { recursive: true, force: true });
  for (const path of nativeBillingTests)
    await rm(join(root, path), { force: true });
}
