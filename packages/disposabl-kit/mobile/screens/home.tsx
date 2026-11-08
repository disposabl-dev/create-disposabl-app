import { VariableContextProvider } from "nativewind";
import { router, Stack } from "expo-router";
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassIconButton } from "../design/preferences";
import { starterFeatures, starterPlatforms } from "../../lib/starter";
import { docsEnabled } from "../../features";

export function HomeScreen() {
  const inset = useSafeAreaInsets();
  const site = process.env.EXPO_PUBLIC_CONVEX_SITE_URL;
  const docs = docsEnabled && site ? `${site.replace(/\/$/, "")}/docs` : null;
  async function openGuide(path: string) {
    try {
      await Linking.openURL(`${docs}/${path}`);
    } catch {
      Alert.alert("Couldn't open the guide", "Please try again.");
    }
  }
  return (
    <>
      <Stack.Screen
        options={{
          title: "Your app",
          headerRight: () => (
            <View className="flex-row gap-[8px]">
              {docs && (
                <GlassIconButton
                  label="Docs"
                  icon={{ ios: "book", android: "menu_book" }}
                  onPress={() => void openGuide("getting-started")}
                />
              )}
              <GlassIconButton
                label="Settings"
                icon={{ ios: "slider.horizontal.3", android: "tune" }}
                onPress={() => router.push("/settings")}
              />
            </View>
          ),
        }}
      />
      <VariableContextProvider
        value={{ "--layout-padding-bottom": inset.bottom + 32 }}
      >
        <ScrollView
          className="flex-1 bg-background"
          contentInsetAdjustmentBehavior="automatic"
          contentContainerClassName="p-[24px] pb-[var(--layout-padding-bottom)] w-[100%] max-w-[680px] self-center gap-[24px]"
        >
          <View className="p-[28px] rounded-[28px] bg-foreground gap-[18px]">
            <Text
              accessibilityElementsHidden
              importantForAccessibility="no"
              className="text-background text-[52px]"
            >
              ✦
            </Text>
            <Text className="text-background text-[34px] font-bold tracking-[-1px]">
              Your app starts here.
            </Text>
            <Text className="text-background text-[17px] leading-[25px]">
              Your workspace is ready. Build on this foundation while your app
              takes shape.
            </Text>
            {docs && (
              <Pressable
                accessibilityRole="link"
                onPress={() => void openGuide("getting-started")}
                className="self-start py-[14px]"
              >
                <Text className="text-background text-[17px] font-semibold">
                  Explore your starter ↗
                </Text>
              </Pressable>
            )}
          </View>
          <Text className="text-foreground text-[24px] font-semibold">
            Built for your platforms
          </Text>
          <View className="gap-[12px]">
            {starterPlatforms.map(({ id, title, detail, guide }) => (
              <View
                key={id}
                className="p-[24px] rounded-[24px] bg-card gap-[8px]"
              >
                <Text className="text-foreground text-[21px] font-semibold">
                  {title}
                </Text>
                <Text className="text-muted-foreground text-[16px] leading-[23px]">
                  {detail}
                </Text>
                {docs && (
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => void openGuide(guide)}
                    className="py-[12px]"
                  >
                    <Text className="text-primary-text text-[16px] font-semibold">
                      Get started with {title} ↗
                    </Text>
                  </Pressable>
                )}
              </View>
            ))}
          </View>
          {starterFeatures.length > 0 && (
            <View className="gap-[12px]">
              <Text className="text-muted-foreground text-[16px]">
                Also included
              </Text>
              <View className="flex-row flex-wrap gap-[8px]">
                {starterFeatures.map((feature) => (
                  <Text
                    key={feature}
                    className="px-[14px] py-[8px] rounded-[20px] bg-card text-foreground"
                  >
                    {feature}
                  </Text>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      </VariableContextProvider>
    </>
  );
}

export const PublicHomeScreen = HomeScreen;
