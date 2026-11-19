import { AuthForm } from "../components/auth-form";

export function LoginScreen({
  initialGoogleEnabled = false,
}: {
  initialGoogleEnabled?: boolean;
}) {
  return <AuthForm mode="login" initialGoogleEnabled={initialGoogleEnabled} />;
}
