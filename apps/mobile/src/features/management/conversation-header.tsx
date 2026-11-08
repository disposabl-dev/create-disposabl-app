import { VariableContextProvider } from "nativewind";
import { MenuView } from "../../../../../packages/disposabl-kit/mobile/design/nativewind";
import { useQuery } from "convex/react";
import { Stack, useRouter } from "expo-router";
import {
  Alert,
  Linking,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../../../../packages/backend/convex/_generated/api";
import { Icon } from "../studio/ui";

export function ConversationHeader({ appId }: { appId: string }) {
  const router = useRouter();

  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const app = useQuery(api.apps.index.get, { appId });
  const previews = useQuery(api.previews.index.list, {
    appId,
    paginationOpts: { numItems: 1, cursor: null },
  });
  const preview = previews?.page[0];
  const web = preview?.platforms.web;
  const previewUrl = web?.latest?.status === "ready" ? web.url : undefined;
  return (
    <Stack.Screen
      options={{
        title: app?.name ?? "Your app",
        headerTitleAlign: "left",
        headerBackVisible: false,
        headerLeft: () => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={12}
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace("/")
            }
          >
            <View className="rotate-180">
              <Icon name="chevron" />
            </View>
          </Pressable>
        ),
        headerTitle: () => (
          <VariableContextProvider
            value={{
              "--layout-max-width": Math.max(
                90,
                Math.min(460, width - insets.left - insets.right - 186),
              ),
            }}
          >
            <View className="max-w-[var(--layout-max-width)] gap-[2px]">
              <Text
                numberOfLines={1}
                className="text-foreground text-[17px] font-semibold"
              >
                {app?.name ?? "Your app"}
              </Text>
              {!!preview && (
                <Text
                  numberOfLines={1}
                  className="text-muted-foreground text-[12px]"
                >
                  {preview.reference}
                </Text>
              )}
            </View>
          </VariableContextProvider>
        ),
        headerRight: () => (
          <View
            className={`flex-row items-center rounded-[26px] px-[4px] ${process.env.EXPO_OS === "ios" ? "" : "bg-card"}`}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New chat"
              onPress={() => router.push("/compose")}
              className="w-[44px] h-[44px] items-center justify-center"
            >
              <Icon name="compose" size={23} />
            </Pressable>
            <MenuView
              actions={[
                {
                  id: "settings",
                  title: "App settings",
                },
                ...(previewUrl && /^https:\/\//.test(previewUrl)
                  ? [
                      {
                        id: "preview",
                        title: "Open preview",
                      },
                    ]
                  : []),
              ]}
              onPressAction={({ nativeEvent }) => {
                if (nativeEvent.event === "settings")
                  router.push({
                    pathname: "/apps/[appId]/details",
                    params: { appId },
                  });
                if (nativeEvent.event === "preview" && previewUrl)
                  void Linking.openURL(previewUrl).catch(() =>
                    Alert.alert("Preview unavailable", "Please try again."),
                  );
              }}
            >
              <View
                collapsable={false}
                accessible
                accessibilityRole="button"
                accessibilityLabel="Chat options"
                className="w-[44px] h-[44px] items-center justify-center"
              >
                <Icon name="more" size={23} />
              </View>
            </MenuView>
          </View>
        ),
      }}
    />
  );
}
