import { Stack, router } from "expo-router";
import { ManagementHome } from "../features/management/home";

export default function Compose() {
  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel="Close create app"
          onPress={() => router.dismissTo("/")}
        >
          Done
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <ManagementHome />
    </>
  );
}
