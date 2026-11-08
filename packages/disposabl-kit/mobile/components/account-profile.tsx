import { useState, type ReactNode } from "react";
import { MenuView } from "../design/nativewind";
import { Alert, Platform, View } from "react-native";
import { Avatar } from "../design/avatar";
import { ThemedText } from "../design/themed-text";
import {
  PreferenceIcon,
  PreferenceIconButton,
  PreferenceSection,
  PreferenceSeparator,
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
  const [emailVisible, setEmailVisible] = useState(false);
  const [local, domain] = email?.split("@") ?? [];
  const masked = local && domain ? `${local[0]}••••@${domain}` : "••••••";
  return (
    <>
      <View className="items-center pb-1 pt-2">
        <Avatar name={name} source={picture} />
        <ThemedText className="mt-4 text-center text-[#18181b] dark:text-[#fafafa] text-[22px] font-semibold">
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
              <ThemedText className="ml-4 text-[#18181b] dark:text-[#fafafa] text-[17px]">
                {email ? "Email" : "Username"}
              </ThemedText>
              <View className="ml-auto flex-row items-center gap-1 shrink min-w-[0px]">
                {email && onCopyEmail ? (
                  <MenuView
                    className="shrink"
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
                      className="min-h-[44px] justify-center"
                    >
                      <ThemedText
                        numberOfLines={1}
                        className="text-[#71717a] dark:text-[#a1a1aa] text-[16px]"
                      >
                        {emailVisible ? email : masked}
                      </ThemedText>
                    </View>
                  </MenuView>
                ) : (
                  <ThemedText
                    selectable={emailVisible || !email}
                    numberOfLines={1}
                    className="text-[#71717a] dark:text-[#a1a1aa] text-[16px] shrink"
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
