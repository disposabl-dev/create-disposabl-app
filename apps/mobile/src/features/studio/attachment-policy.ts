export const MAX_ATTACHMENTS = 10;
export const ATTACHMENT_SIZE_ERROR = "File must be nonempty and at most 5 MiB.";

export function attachmentUploadError(error: unknown) {
  return error instanceof Error && error.message === ATTACHMENT_SIZE_ERROR
    ? ATTACHMENT_SIZE_ERROR
    : "Could not upload the file. Check your connection and try again.";
}

export function attachmentIds<T extends string>(
  items: { id?: T }[],
): T[] | null {
  if (items.length > MAX_ATTACHMENTS || items.some((item) => !item.id))
    return null;
  return items.map((item) => item.id!);
}
