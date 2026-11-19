import { AuthForm } from "../components/auth-form";

export function SignupScreen({
  initialGoogleEnabled = false,
}: {
  initialGoogleEnabled?: boolean;
}) {
  return <AuthForm mode="signup" initialGoogleEnabled={initialGoogleEnabled} />;
}
