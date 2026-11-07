import { MenuView } from "@expo/ui/community/menu";
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
import { useTheme } from "../../../../../packages/disposabl-kit/mobile/design/use-theme";
import { Icon } from "../studio/ui";

export function ConversationHeader({ appId }: { appId: string }) {
  const router = useRouter();
  const c = useTheme();
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
            <View style={{ transform: [{ rotate: "180deg" }] }}>
              <Icon name="chevron" />
            </View>
          </Pressable>
        ),
        headerTitle: () => (
          <View
            style={{
              maxWidth: Math.max(
                90,
                Math.min(460, width - insets.left - insets.right - 186),
              ),
              gap: 2,
            }}
          >
            <Text
              numberOfLines={1}
              style={{ color: c.foreground, fontSize: 17, fontWeight: "600" }}
            >
              {app?.name ?? "Your app"}
            </Text>
            {!!preview && (
              <Text
                numberOfLines={1}
                style={{ color: c.mutedForeground, fontSize: 12 }}
              >
                {preview.reference}
              </Text>
            )}
          </View>
        ),
        headerRight: () => (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              borderRadius: 26,
              paddingHorizontal: 4,
              backgroundColor:
                process.env.EXPO_OS === "ios" ? undefined : c.card,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New chat"
              onPress={() => router.push("/compose")}
              style={{
                width: 44,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
              }}
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
                style={{
                  width: 44,
                  height: 44,
                  alignItems: "center",
                  justifyContent: "center",
                }}
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
