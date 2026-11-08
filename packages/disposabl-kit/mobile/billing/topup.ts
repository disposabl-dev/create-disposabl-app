import type Purchases from "react-native-purchases";
import type { PurchasesStoreProduct } from "react-native-purchases";

export type TopupRoute = { app: string; store: string; product: string };
export type TopupSnapshot = {
  customerId: string;
  nativeTopupRoutes: TopupRoute[];
};
type SDK = Pick<
  typeof Purchases,
  | "getProducts"
  | "purchaseStoreProduct"
  | "getAppUserID"
  | "canMakePayments"
  | "PRODUCT_CATEGORY"
>;

export function matchingTopupRoute(
  snapshot: TopupSnapshot,
  platform: string,
  app: string | undefined,
  product: string | undefined,
) {
  const store =
    platform === "ios"
      ? "APP_STORE"
      : platform === "android"
        ? "PLAY_STORE"
        : null;
  return (
    !!app &&
    !!product &&
    !!store &&
    snapshot.nativeTopupRoutes.some(
      (route) =>
        route.app === app && route.store === store && route.product === product,
    )
  );
}

export async function loadTopup(
  sdk: SDK,
  platform: string,
  productId: string,
): Promise<PurchasesStoreProduct | null> {
  const products = await sdk.getProducts(
    [productId],
    sdk.PRODUCT_CATEGORY.NON_SUBSCRIPTION,
  );
  if (products.length !== 1) return null;
  const product = products[0]!;
  if (
    product.identifier !== productId ||
    product.productCategory !== "NON_SUBSCRIPTION" ||
    !product.priceString
  )
    return null;
  // StoreKit 1 cannot prove the type. Play's SDK may return UNKNOWN; its
  // consumable configuration must be independently verified by the operator.
  if (
    platform === "ios"
      ? product.productType !== "CONSUMABLE"
      : platform !== "android" ||
        !["CONSUMABLE", "UNKNOWN"].includes(product.productType)
  )
    return null;
  return product;
}

/** Run inside the billing session and transaction lease. */
export async function purchaseTopup(
  sdk: SDK,
  snapshot: () => Promise<TopupSnapshot>,
  current: () => boolean,
  customerId: string,
  platform: string,
  app: string | undefined,
  productId: string | undefined,
) {
  const check = () => {
    if (!current()) throw new Error("Account changed.");
  };
  const latest = await snapshot();
  check();
  if (
    latest.customerId !== customerId ||
    !matchingTopupRoute(latest, platform, app, productId)
  )
    throw new Error("Top-up unavailable.");
  if (!(await sdk.canMakePayments())) throw new Error("Payments restricted.");
  check();
  if ((await sdk.getAppUserID()) !== customerId)
    throw new Error("Account changed.");
  check();
  const product = await loadTopup(sdk, platform, productId!);
  check();
  if (!product) throw new Error("Top-up unavailable.");
  await sdk.purchaseStoreProduct(product);
}
