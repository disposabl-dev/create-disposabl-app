// Loopback test counter only: no provider, credentials, or external requests.
export async function debitCompute(userId: string) {
  const response = await fetch("http://127.0.0.1:3540/api/mutation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "fixture:dispatch",
      args: { userId },
      format: "json",
    }),
  });
  const data = (await response.json()) as any;
  if (data.status !== "success")
    throw new Error("Synthetic debit counter failed");
  return data.value as
    { outcome: "unknown" } | { outcome: "confirmed"; responseBalance: number };
}
