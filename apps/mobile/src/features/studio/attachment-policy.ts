export const MAX_ATTACHMENTS = 10;

export function attachmentIds<T extends string>(
  items: { id?: T }[],
): T[] | null {
  if (items.length > MAX_ATTACHMENTS || items.some((item) => !item.id))
    return null;
  return items.map((item) => item.id!);
}
