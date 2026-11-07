import { legalConfig } from "../legal/config";

// Remote app directories may use the app UUID as their package name.
export const displayAppName = (name: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    name,
  )
    ? null
    : name;
export const appName = displayAppName(legalConfig.appName);
