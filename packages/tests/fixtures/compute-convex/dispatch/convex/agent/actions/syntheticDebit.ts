// Loopback-only adapter. A deferred synthetic response lets the test invoke the
// real uncertainty handler before releasing a late confirmation.
export async function debitCompute(userId: string) {
  async function call(kind: "mutation" | "query", name: string) {
    const response = await fetch(`http://127.0.0.1:3540/api/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: `fixture:${name}`,
        args: { userId },
        format: "json",
      }),
    });
    const data = (await response.json()) as any;
    if (data.status !== "success")
      throw new Error("Synthetic debit counter failed");
    return data.value;
  }
  let result = await call("mutation", "dispatch");
  for (let i = 0; result.outcome === "deferred" && i < 200; i++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    result = await call("query", "outcome");
  }
  if (result.outcome === "deferred")
    throw new Error("Synthetic debit release timed out");
  return result as
    | { outcome: "unknown" | "denied" }
    | { outcome: "confirmed"; responseBalance: number };
}
