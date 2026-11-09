import { createContext, useContext } from "react";

export const SessionCurrentContext = createContext<() => boolean>(() => true);

export function useCurrentConnectionSession() {
  return useContext(SessionCurrentContext);
}
