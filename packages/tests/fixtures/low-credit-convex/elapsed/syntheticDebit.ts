// Synthetic loopback adapter for the registered product renewal action.
export async function debitCompute(userId: string) {
  const response = await fetch("http://127.0.0.1:3480/api/mutation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "elapsedFixture:debit",
      args: { userId },
      format: "json",
    }),
  });
  const result = (await response.json()) as any;
  if (result.status !== "success") throw new Error("Synthetic debit failed");
  return result.value as
    { outcome: "denied" } | { outcome: "confirmed"; responseBalance: number };
}
