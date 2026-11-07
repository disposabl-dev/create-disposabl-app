import "../../../../packages/disposabl-kit/mobile/global.css";
import { MobileLayout } from "@disposabl/disposabl-kit/mobile";
import { useFonts, SplineSans_500Medium } from "@expo-google-fonts/spline-sans";
import { StudioNavigation } from "../features/studio/navigation";

export default function Layout() {
  useFonts({ "Spline Sans": SplineSans_500Medium });
  return (
    <MobileLayout>
      <StudioNavigation />
    </MobileLayout>
  );
}
