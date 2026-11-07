import { appName } from "../../lib/app-name";

export function Logo() {
  if (!appName) return <span className="text-xl font-semibold">Home</span>;
  return appName === "Disposabl" ? (
    <img src="/disposabl-logo.svg" alt="Disposabl" className="h-9 w-auto" />
  ) : (
    <span className="text-xl font-semibold">{appName}</span>
  );
}
