import { router } from "expo-router";
import { ManagementHome } from "../features/management/home";
import { ScreenCloseButton } from "@disposabl/disposabl-kit/mobile";

export default function Compose() {
  return (
    <>
      <ScreenCloseButton
        label="Close create app"
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace("/")
        }
      />
      <ManagementHome />
    </>
  );
}
