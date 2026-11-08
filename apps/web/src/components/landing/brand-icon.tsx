import { Globe, Terminal, Code2 } from "lucide-react";
import { ProviderLogo } from "../connections/provider-logo";
import apple from "./assets/apple.svg";
import android from "./assets/android.svg";
import windows from "./assets/windows.svg";
import linux from "./assets/linux.svg";
import mcp from "./assets/mcp.svg";
import react from "./assets/react.svg";
import electron from "./assets/electron.svg";
import typescript from "./assets/typescript.svg";
import github from "./assets/github.svg";
import bun from "./assets/bun.svg";
import turborepo from "./assets/turborepo.svg";
import tailwind from "./assets/tailwindcss.svg";
import vite from "./assets/vite.svg";
import play from "./assets/googleplay.svg";
import openapi from "./assets/openapiinitiative.svg";
import tanstack from "./assets/tanstack.svg";

// Additional brand marks from Simple Icons, CC0: github.com/simple-icons/simple-icons.
const marks: Record<string, string> = {
  Apple: apple,
  iOS: apple,
  macOS: apple,
  Android: android,
  Windows: windows,
  Linux: linux,
  MCP: mcp,
  "Model Context Protocol": mcp,
  React: react,
  "TanStack Start": tanstack,
  "React Native": react,
  Electron: electron,
  "Electron Forge": electron,
  TypeScript: typescript,
  "TypeScript SDK": typescript,
  GitHub: github,
  "GitHub Actions": github,
  Bun: bun,
  Turborepo: turborepo,
  "Tailwind CSS": tailwind,
  Vite: vite,
  "Google Play": play,
  OpenAPI: openapi,
};
export function BrandIcon({ name }: { name: string }) {
  if (name === "Convex" || name === "Convex HTTP")
    return (
      <span className="brand-icon">
        <ProviderLogo provider="convex" />
      </span>
    );
  if (name === "Expo" || name === "Expo Router")
    return (
      <span className="brand-icon">
        <ProviderLogo provider="expo" />
      </span>
    );
  if (marks[name])
    return (
      <img
        className={`brand-icon${["Android", "Windows", "Linux"].includes(name) ? "" : " brand-monochrome"}`}
        src={marks[name]}
        alt=""
        width={24}
        height={24}
      />
    );
  const Icon = name === "Web" ? Globe : name === "CLI" ? Terminal : Code2;
  return <Icon className="brand-icon" aria-hidden="true" size={24} />;
}
