import { useConvexAuth, usePaginatedQuery } from "convex/react";
import { Stack, router } from "expo-router";
import { ActivityIndicator, FlatList, View } from "react-native";
import { api } from "../../../../../packages/backend/convex/_generated/api";
import { useTheme } from "../../../../../packages/disposabl-kit/mobile/design/use-theme";
import { authenticationEnabled } from "@disposabl/disposabl-kit/features";
import { Action, Icon, Label, Screen, Touch } from "./ui";
import { captureProductAction } from "../product-telemetry";

export default function AppsScreen() {
  return authenticationEnabled ? (
    <SessionApps />
  ) : (
    <Screen title="Your apps">
      <Label>App management requires authentication.</Label>
    </Screen>
  );
}
function SessionApps() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (isLoading)
    return (
      <Screen title="Your apps">
        <ActivityIndicator accessibilityLabel="Loading apps" />
      </Screen>
    );
  if (!isAuthenticated)
    return (
      <Screen title="Your apps">
        <Label variant="title">A home for your ideas.</Label>
        <Label>Sign in to create and manage your apps.</Label>
        <Action label="Sign in" onPress={() => router.push("/(auth)/login")} />
      </Screen>
    );
  return <OwnedApps />;
}

function OwnedApps() {
  const c = useTheme();
  const { results, status, loadMore } = usePaginatedQuery(
    api.apps.index.list,
    {},
    { initialNumItems: 20 },
  );
  return (
    <>
      <Stack.Screen options={{ title: "Your apps" }} />
      <FlatList
        data={results}
        keyExtractor={(app) => app.appId}
        contentInsetAdjustmentBehavior="automatic"
        className="flex-1 bg-background"
        contentContainerClassName="p-[24px] gap-[12px] pb-[48px]"
        ListEmptyComponent={
          status === "LoadingFirstPage" ? (
            <ActivityIndicator accessibilityLabel="Loading apps" />
          ) : (
            <View className="gap-5 rounded-[28px] bg-card p-7">
              <Label variant="title">Create your first app.</Label>
              <Action
                label="Create app"
                onPress={() => {
                  captureProductAction("open_create");
                  router.push("/compose");
                }}
              />
            </View>
          )
        }
        renderItem={({ item }) => (
          <Touch
            label={`Open ${item.name}`}
            onPress={() => {
              captureProductAction("open_app");
              router.push({
                pathname: "/(authenticated)/apps/[appId]",
                params: { appId: item.appId },
              });
            }}
            className="flex-row items-center gap-[16px] py-[20px]"
          >
            <View className="h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <Icon name="grid" />
            </View>
            <View className="flex-1 gap-[6px]">
              <Label variant="heading">{item.name}</Label>
              <Label variant="caption" color={c.mutedForeground}>
                {item.platforms.join(" · ")}
              </Label>
            </View>
            <Icon name="chevron" size={16} />
          </Touch>
        )}
        ListFooterComponent={
          status === "CanLoadMore" ? (
            <Action label="More apps" secondary onPress={() => loadMore(20)} />
          ) : status === "LoadingMore" ? (
            <ActivityIndicator accessibilityLabel="Loading more apps" />
          ) : undefined
        }
      />
    </>
  );
}
