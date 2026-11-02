import type { TokenStorage } from "@convex-dev/auth/react";
import * as SecureStore from "expo-secure-store";

// Convex Auth namespaces these keys by deployment and owns refresh and cleanup.
export const authStorage: TokenStorage = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
};
