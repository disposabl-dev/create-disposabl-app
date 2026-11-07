import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { View } from "react-native";
import Constants from "expo-constants";
import * as Clipboard from "expo-clipboard";
import { SettingsLinks } from "../components/settings-links";
import { SettingsPage } from "../components/settings-page";
import { AccountProfile } from "../components/account-profile";
import { AppearanceSettings } from "../components/appearance-settings";
import {
  PreferenceCard,
  PreferenceRow,
  PreferenceSection,
  usePreferenceColors,
} from "../design/preferences";
import { ThemedText } from "../design/themed-text";
import { api } from "../lib/convex";
import { authenticationEnabled, paymentsEnabled } from "../../features";
import { AccountBilling } from "../billing/account-billing";
import { billingSession } from "../billing/session";

type AccountScreenProps = {
  accountRows?: ReactNode;
  sections?: ReactNode;
  footer?: ReactNode;
  onCopyEmail?: (email: string) => Promise<void>;
};

async function copyEmail(email: string) {
  if (
    !(await Clipboard.setStringAsync(email, { android: { isSensitive: true } }))
  )
    throw new Error("Could not copy email.");
}

/** Preferences are public. Only account content requires an authenticated provider. */
export function AccountScreen(props: AccountScreenProps) {
  return authenticationEnabled ? (
    <SessionSettings {...props} />
  ) : (
    <GuestSettings {...props} />
  );
}

function SessionSettings(props: AccountScreenProps) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  return isAuthenticated ? (
    <SignedInSettings {...props} />
  ) : (
    <GuestSettings {...props} loading={isLoading} />
  );
}

function GuestSettings({
  sections,
  footer,
  loading = false,
}: AccountScreenProps & { loading?: boolean }) {
  return (
    <SettingsPage>
      {authenticationEnabled && (
        <PreferenceSection title="Account">
          <PreferenceRow
            icon={{ ios: "person.crop.circle", android: "account_circle" }}
            label={loading ? "Loading account..." : "Sign in"}
            disabled={loading}
            onPress={() =>
              router.replace({
                pathname: "/(auth)/login",
                params: { returnTo: "/settings" },
              })
            }
          />
        </PreferenceSection>
      )}
      <AppearanceSettings />
      {sections}
      <SettingsLinks />
      {footer}
      <Version />
    </SettingsPage>
  );
}

function SignedInSettings({
  accountRows,
  sections,
  footer,
  onCopyEmail = copyEmail,
}: AccountScreenProps) {
  const colors = usePreferenceColors();
  const { isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.index.current, isAuthenticated ? {} : "skip");
  const account = useQuery(api.auth.account, isAuthenticated ? {} : "skip");
  const { signOut } = useAuthActions();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [billingEpoch, setBillingEpoch] = useState(0);

  async function logOut() {
    if (pending) return;
    billingSession.select(null);
    setPending(true);
    setError(null);
    try {
      await signOut();
      router.dismissTo("/");
    } catch {
      setBillingEpoch((value) => value + 1);
      setError("Couldn't clear your session. Please try logging out again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <SettingsPage>
      {account === undefined ? (
        <ThemedText>Loading your profile...</ThemedText>
      ) : account ? (
        <AccountProfile
          key={user?.id}
          name={account.profile?.name ?? account.username ?? "Your profile"}
          email={account.profile?.email ?? account.email}
          picture={account.profile?.picture}
          username={account.username}
          onCopyEmail={onCopyEmail}
        >
          {accountRows}
        </AccountProfile>
      ) : (
        <ThemedText accessibilityRole="alert">
          Your account could not be loaded.
        </ThemedText>
      )}
      <AppearanceSettings />
      {sections}
      {account?.passwordMethod && (
        <PreferenceSection title="Security">
          <PreferenceRow
            icon={{ ios: "lock", android: "lock" }}
            label="Change password"
            onPress={() => router.push("/(authenticated)/change-password")}
          />
        </PreferenceSection>
      )}
      {isAuthenticated && user && paymentsEnabled && !pending && (
        <PreferenceSection title="Billing">
          <View style={{ padding: 20 }}>
            <AccountBilling
              key={`${user.id}:${billingEpoch}`}
              customerId={user.id}
            />
          </View>
        </PreferenceSection>
      )}
      <View className="mt-7">
        <PreferenceCard>
          <PreferenceRow
            icon={{
              ios: "rectangle.portrait.and.arrow.right",
              android: "logout",
            }}
            label={pending ? "Logging out..." : "Log out"}
            destructive
            disabled={pending}
            onPress={() => void logOut()}
          />
        </PreferenceCard>
      </View>
      {error && (
        <ThemedText
          accessibilityRole="alert"
          className="mt-3"
          style={{ color: colors.destructive }}
        >
          {error}
        </ThemedText>
      )}
      <SettingsLinks />
      {footer}
      <Version />
    </SettingsPage>
  );
}

function Version() {
  const colors = usePreferenceColors();
  return Constants.expoConfig?.version ? (
    <ThemedText
      className="mt-7 text-center"
      style={{ color: colors.secondary, fontSize: 13 }}
    >
      Version {Constants.expoConfig.version}
    </ThemedText>
  ) : null;
}
