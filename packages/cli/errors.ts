/** Format the credit gate without trusting a redirect or starting checkout. */
export function apiError(status: number, body: string): string {
  try {
    const data = JSON.parse(body)?.error;
    if (data?.code === "credits_required") {
      const paymentUrl =
        data.paymentUrl === "https://www.disposabl.dev/pricing"
          ? `\nAdd credits: ${data.paymentUrl}`
          : "";
      return `At least 10 credits are required for each agent request. Agent compute costs 10 credits per 10-minute window; AI is currently included.${paymentUrl}`;
    }
    if (data?.code === "credits_unavailable")
      return "Credits are temporarily unavailable. Please retry.";
  } catch {
    // Keep the ordinary API error for responses that are not JSON.
  }
  return `API request failed (${status}): ${body}`;
}
