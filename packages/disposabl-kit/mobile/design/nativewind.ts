import { styled } from "nativewind";
import { Host as ExpoHost } from "@expo/ui";
import { MenuView as ExpoMenuView } from "@expo/ui/community/menu";
import { GlassView as ExpoGlassView } from "expo-glass-effect";
import { SymbolView as ExpoSymbolView } from "expo-symbols";

// Native controls need explicit className-to-style mappings.
export const Host = styled(ExpoHost);
export const MenuView = styled(ExpoMenuView);
export const GlassView = styled(ExpoGlassView);
export const SymbolView = styled(ExpoSymbolView);
