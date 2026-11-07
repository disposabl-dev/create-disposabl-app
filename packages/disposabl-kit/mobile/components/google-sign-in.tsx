import { authReturnPath } from "../lib/auth-return";
import { useSignInWithGoogle } from "@convex-dev/auth/methods/google/react";
import { router, useLocalSearchParams } from "expo-router";
import { openAuthSessionAsync } from "expo-web-browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import {
  mobileAuthCallback,
  mobileAuthPath,
  mobileAuthReturnUrl,
} from "../../lib/mobile-auth";
import { api } from "../lib/convex";
import { useAuthStyles } from "./auth-ui";
import { GoogleButton } from "./google-button";

export function GoogleSignIn({ disabled = false }: { disabled?: boolean }) {
  const styles = useAuthStyles();
  const { signIn } = useSignInWithGoogle(api.auth);
  const params = useLocalSearchParams<{
    returnTo?: string;
    convexAuthCode?: string;
    convexAuthError?: string;
  }>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const working = useRef(false);
  const handled = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const finish = useCallback(
    async (code: string | null, failure: string | null) => {
      if (!mounted.current || (code && handled.current === code)) return;
      if (failure || !code) {
        setError(
          failure === "access_denied"
            ? "Google sign-in was cancelled."
            : "Google sign-in failed. Please try again.",
        );
        return;
      }
      handled.current = code;
      setPending(true);
      try {
        // Convex redeems the ticket with this device's securely stored flow state.
        const result = await signIn({ code });
        if (!mounted.current) return;
        if (result.status === "complete")
          router.replace(authReturnPath(params.returnTo));
        else setError("That sign-in could not be completed. Please try again.");
      } catch {
        if (mounted.current)
          setError("Couldn't complete Google sign-in. Please try again.");
      } finally {
        if (mounted.current) setPending(false);
      }
    },
    [signIn, params.returnTo],
  );

  useEffect(() => {
    if (!params.convexAuthCode && !params.convexAuthError) return;
    const code = params.convexAuthCode ?? null;
    const failure = params.convexAuthError ?? null;
    router.setParams({ convexAuthCode: undefined, convexAuthError: undefined });
    // The OS can return into a newly mounted route after the browser session.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void finish(code, failure);
  }, [params.convexAuthCode, params.convexAuthError, finish]);

  async function start() {
    if (working.current) return;
    working.current = true;
    setPending(true);
    setError(null);
    try {
      const origin = process.env.EXPO_PUBLIC_CONVEX_SITE_URL;
      if (!origin) throw new Error("Missing backend URL");
      const result = await signIn({
        redirectTo: new URL(mobileAuthPath, origin).href,
      });
      if (result.status !== "redirect")
        throw new Error("Could not start sign-in");
      const response = await openAuthSessionAsync(
        result.redirect.href,
        mobileAuthReturnUrl,
      );
      if (!mounted.current) return;
      if (response.type === "success") {
        const callback = mobileAuthCallback(response.url);
        await finish(callback.code, callback.error);
      }
    } catch {
      if (mounted.current)
        setError("Couldn't connect to Google. Please try again.");
    } finally {
      working.current = false;
      if (mounted.current) setPending(false);
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <GoogleButton
        pending={pending}
        disabled={disabled}
        onPress={() => void start()}
      />
      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
    </View>
  );
}
