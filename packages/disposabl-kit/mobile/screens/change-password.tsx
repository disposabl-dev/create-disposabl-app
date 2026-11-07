import { authErrorMessage } from "../../lib/auth-errors";
import { useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";
import { Keyboard, Switch, Text, TextInput, View } from "react-native";
import { AuthButton, AuthScreen, useAuthStyles } from "../components/auth-ui";
import { api } from "../lib/convex";

export function ChangePasswordScreen() {
  const styles = useAuthStyles();
  const user = useQuery(api.auth.account);
  const usernameChange = useMutation(api.auth.changePassword);
  const emailChange = useMutation(api.authEmail.changePassword);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [signOutOtherSessions, setSignOutOtherSessions] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    success: boolean;
  } | null>(null);
  const submitting = useRef(false);

  async function submit() {
    if (submitting.current || !currentPassword || !newPassword || !confirmation)
      return;
    if (newPassword !== confirmation) {
      setMessage({ text: "New passwords don't match.", success: false });
      return;
    }
    submitting.current = true;
    setPending(true);
    setMessage(null);
    Keyboard.dismiss();
    try {
      const changePassword =
        user?.passwordMethod === "email" ? emailChange : usernameChange;
      const result = await changePassword({
        currentPassword,
        newPassword,
        signOutOtherSessions,
      });
      if (!result.success)
        setMessage({
          text: authErrorMessage(result.userError),
          success: false,
        });
      else {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmation("");
        setMessage({ text: "Your password has been changed.", success: true });
      }
    } catch {
      setMessage({
        text: "Couldn't change your password. Check your connection and try again.",
        success: false,
      });
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <AuthScreen>
      <Text style={styles.title}>Change password</Text>
      {user === undefined ? (
        <Text style={styles.body}>Loading your account...</Text>
      ) : user === null ? (
        <Text style={styles.error}>Your account could not be found.</Text>
      ) : !user.passwordMethod ? (
        <Text style={styles.body}>
          This account uses an external sign-in provider. Continue using your
          sign-in provider.
        </Text>
      ) : (
        <>
          {(
            [
              [
                "Current password",
                currentPassword,
                setCurrentPassword,
                "current-password",
              ],
              ["New password", newPassword, setNewPassword, "new-password"],
              [
                "Confirm new password",
                confirmation,
                setConfirmation,
                "new-password",
              ],
            ] as const
          ).map(([label, value, onChangeText, autoComplete]) => (
            <View key={label} style={styles.field}>
              <Text style={styles.label}>{label}</Text>
              <TextInput
                accessibilityLabel={label}
                style={styles.input}
                value={value}
                onChangeText={onChangeText}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete={autoComplete}
                editable={!pending}
              />
            </View>
          ))}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <Text style={[styles.label, { flex: 1 }]}>
              Log out other devices
            </Text>
            <Switch
              accessibilityLabel="Log out other devices"
              value={signOutOtherSessions}
              onValueChange={setSignOutOtherSessions}
              disabled={pending}
            />
          </View>
          {message && (
            <Text
              accessibilityRole="alert"
              style={message.success ? styles.body : styles.error}
            >
              {message.text}
            </Text>
          )}
          <AuthButton
            title={pending ? "Changing password..." : "Change password"}
            pending={pending}
            disabled={!currentPassword || !newPassword || !confirmation}
            onPress={() => void submit()}
          />
        </>
      )}
    </AuthScreen>
  );
}
