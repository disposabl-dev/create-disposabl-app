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
import { useTheme } from "../design/use-theme";
import { starterFeatures, starterPlatforms } from "../../lib/starter";
import { docsEnabled } from "../../features";

export function HomeScreen() {
  const c = useTheme();
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
            <GlassIconButton
              label="Settings"
              icon={{ ios: "slider.horizontal.3", android: "tune" }}
              onPress={() => router.push("/settings")}
            />
          ),
        }}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: c.background }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          padding: 24,
          paddingBottom: inset.bottom + 32,
          width: "100%",
          maxWidth: 680,
          alignSelf: "center",
          gap: 24,
        }}
      >
        <View
          style={{
            padding: 28,
            borderRadius: 28,
            backgroundColor: c.foreground,
            gap: 18,
          }}
        >
          <Text
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={{ color: c.background, fontSize: 52 }}
          >
            ✦
          </Text>
          <Text
            style={{
              color: c.background,
              fontSize: 34,
              fontWeight: "700",
              letterSpacing: -1,
            }}
          >
            Your app starts here.
          </Text>
          <Text style={{ color: c.background, fontSize: 17, lineHeight: 25 }}>
            Your workspace is ready. Build on this foundation while your app
            takes shape.
          </Text>
          {docs && (
            <Pressable
              accessibilityRole="link"
              onPress={() => void openGuide("getting-started")}
              style={{ alignSelf: "flex-start", paddingVertical: 14 }}
            >
              <Text
                style={{ color: c.background, fontSize: 17, fontWeight: "600" }}
              >
                Explore your starter ↗
              </Text>
            </Pressable>
          )}
        </View>
        <Text style={{ color: c.foreground, fontSize: 24, fontWeight: "600" }}>
          Built for your platforms
        </Text>
        <View style={{ gap: 12 }}>
          {starterPlatforms.map(({ id, title, detail, guide }) => (
            <View
              key={id}
              style={{
                padding: 24,
                borderRadius: 24,
                backgroundColor: c.card,
                gap: 8,
              }}
            >
              <Text
                style={{ color: c.foreground, fontSize: 21, fontWeight: "600" }}
              >
                {title}
              </Text>
              <Text
                style={{
                  color: c.mutedForeground,
                  fontSize: 16,
                  lineHeight: 23,
                }}
              >
                {detail}
              </Text>
              {docs && (
                <Pressable
                  accessibilityRole="link"
                  onPress={() => void openGuide(guide)}
                  style={{ paddingVertical: 12 }}
                >
                  <Text
                    style={{
                      color: c.primaryText,
                      fontSize: 16,
                      fontWeight: "600",
                    }}
                  >
                    Get started with {title} ↗
                  </Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>
        {starterFeatures.length > 0 && (
          <View style={{ gap: 12 }}>
            <Text style={{ color: c.mutedForeground, fontSize: 16 }}>
              Also included
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {starterFeatures.map((feature) => (
                <Text
                  key={feature}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 20,
                    backgroundColor: c.card,
                    color: c.foreground,
                  }}
                >
                  {feature}
                </Text>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </>
  );
}

export const PublicHomeScreen = HomeScreen;
