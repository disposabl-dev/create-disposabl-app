import { spawn } from "node:child_process";

/** Expo requires a user session in sudo mode; access tokens cannot provide it. */
export async function completeExpoDeletion(projectId: unknown) {
  if (
    typeof projectId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      projectId,
    )
  )
    throw new Error("The service returned an invalid Expo project ID.");
  const command = `bunx eas-cli@27.2.0 project:delete ${projectId}`;
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error(
      `Expo needs an interactive login and password confirmation. Run ${command}, then retry apps delete. Your app and remaining resources are retained.`,
    );
  console.error(
    "Expo requires you to confirm deletion in your Expo account. Complete the following EAS prompts to continue.",
  );
  // EAS owns login, password confirmation and MFA. Do not pass the CI robot token.
  const { EXPO_TOKEN: _token, ...env } = process.env;
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "bunx",
      ["eas-cli@27.2.0", "project:delete", projectId],
      { stdio: "inherit", env },
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              "Expo deletion was not completed. Retry apps delete when ready.",
            ),
          ),
    );
  });
}
