import { useState, type ReactNode } from "react";
import { MenuView } from "@expo/ui/community/menu";
import { Alert, Platform, View } from "react-native";
import { Avatar } from "../design/avatar";
import { ThemedText } from "../design/themed-text";
import {
  PreferenceIcon,
  PreferenceIconButton,
  PreferenceSection,
  PreferenceSeparator,
  usePreferenceColors,
} from "../design/preferences";

export function AccountProfile({
  name,
  email,
  picture,
  username,
  children,
  title = "Account",
  onCopyEmail,
}: {
  name: string;
  email?: string | null;
  picture?: string | null;
  username?: string | null;
  children?: ReactNode;
  title?: string;
  onCopyEmail?: (email: string) => Promise<void>;
}) {
  const colors = usePreferenceColors();
  const [emailVisible, setEmailVisible] = useState(false);
  const [local, domain] = email?.split("@") ?? [];
  const masked = local && domain ? `${local[0]}••••@${domain}` : "••••••";
  return (
    <>
      <View className="items-center pb-1 pt-2">
        <Avatar name={name} source={picture} />
        <ThemedText
          className="mt-4 text-center"
          style={{ color: colors.text, fontSize: 22, fontWeight: "600" }}
        >
          {name}
        </ThemedText>
      </View>
      {(email || username || children) && (
        <PreferenceSection title={title}>
          {(email || username) && (
            <View className="min-h-[60px] flex-row flex-wrap items-center gap-y-2 px-5 py-3">
              <PreferenceIcon
                icon={
                  email
                    ? { ios: "envelope", android: "mail" }
                    : { ios: "person", android: "person" }
                }
              />
              <ThemedText
                className="ml-4"
                style={{ color: colors.text, fontSize: 17 }}
              >
                {email ? "Email" : "Username"}
              </ThemedText>
              <View
                className="ml-auto flex-row items-center gap-1"
                style={{ flexShrink: 1, minWidth: 0 }}
              >
                {email && onCopyEmail ? (
                  <MenuView
                    style={{ flexShrink: 1 }}
                    actions={[{ id: "copy", title: "Copy email" }]}
                    onPressAction={() =>
                      void onCopyEmail(email).catch(() =>
                        Alert.alert(
                          "Could not copy email",
                          "Please try again.",
                        ),
                      )
                    }
                  >
                    <View
                      collapsable={false}
                      pointerEvents={Platform.OS === "ios" ? "none" : "auto"}
                      accessibilityRole="button"
                      accessibilityLabel="Email options"
                      style={{ minHeight: 44, justifyContent: "center" }}
                    >
                      <ThemedText
                        numberOfLines={1}
                        style={{ color: colors.secondary, fontSize: 16 }}
                      >
                        {emailVisible ? email : masked}
                      </ThemedText>
                    </View>
                  </MenuView>
                ) : (
                  <ThemedText
                    selectable={emailVisible || !email}
                    numberOfLines={1}
                    style={{
                      color: colors.secondary,
                      fontSize: 16,
                      flexShrink: 1,
                    }}
                  >
                    {email ? (emailVisible ? email : masked) : username}
                  </ThemedText>
                )}
                {email && (
                  <PreferenceIconButton
                    icon={
                      emailVisible
                        ? { ios: "eye.slash", android: "visibility_off" }
                        : { ios: "eye", android: "visibility" }
                    }
                    label={emailVisible ? "Hide email" : "Reveal email"}
                    onPress={() => setEmailVisible((value) => !value)}
                  />
                )}
              </View>
            </View>
          )}
          {children && (email || username) ? <PreferenceSeparator /> : null}
          {children}
        </PreferenceSection>
      )}
    </>
  );
}
