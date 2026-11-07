// Allow small changes in message height while following a live response.
export function isNearConversationEnd(
  offset: number,
  viewport: number,
  content: number,
) {
  return content - (offset + viewport) <= 80;
}
