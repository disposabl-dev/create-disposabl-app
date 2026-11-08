import { useAction } from "convex/react";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { useRef, useState } from "react";
import { Alert } from "react-native";
import { api } from "../../../../../packages/backend/convex/_generated/api";
import type { Id } from "../../../../../packages/backend/convex/_generated/dataModel";
import {
  ATTACHMENT_SIZE_ERROR,
  attachmentUploadError,
  MAX_ATTACHMENTS,
} from "./attachment-policy";
import { useAttachmentLifecycle } from "./attachment-lifecycle";

export type Attachment = {
  key: string;
  uri: string;
  name: string;
  mediaType: string;
  id?: Id<"files">;
  error?: string;
};
export type AttachmentSource = "camera" | "photos" | "files";
const MAX_BYTES = 5 * 1024 * 1024;

export function useAttachments() {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const picking = useRef(false);
  const nextKey = useRef(0);
  const upload = useAction(api.files.index.upload);
  const removeFile = useAction(api.files.index.remove);
  const lifecycle = useAttachmentLifecycle<Id<"files">>((id) =>
    removeFile({ id }),
  );
  async function uploadOne(attachment: Attachment, token: number) {
    try {
      const file = new File(attachment.uri);
      if (!file.size || file.size > MAX_BYTES)
        throw new Error(ATTACHMENT_SIZE_ERROR);
      const bytes = await file.arrayBuffer();
      if (!lifecycle.active(token)) return;
      const id = await upload({
        filename: attachment.name,
        mediaType: attachment.mediaType,
        bytes,
      });
      if (!lifecycle.uploaded(id, token)) return;
      setAttachments((items) =>
        items.map((item) =>
          item.key === attachment.key
            ? { ...item, id, error: undefined }
            : item,
        ),
      );
    } catch (error) {
      if (!lifecycle.active(token)) return;
      const message = attachmentUploadError(error);
      setAttachments((items) =>
        items.map((item) =>
          item.key === attachment.key ? { ...item, error: message } : item,
        ),
      );
    }
  }
  async function retry(attachment: Attachment) {
    if (picking.current) return;
    const token = lifecycle.generation();
    if (!lifecycle.active(token)) return;
    picking.current = true;
    setBusy(true);
    try {
      await uploadOne(attachment, token);
    } finally {
      picking.current = false;
      if (lifecycle.active(token)) setBusy(false);
    }
  }
  async function remove(attachment: Attachment) {
    if (picking.current) return;
    const token = lifecycle.generation();
    if (!lifecycle.active(token)) return;
    picking.current = true;
    setBusy(true);
    try {
      if (attachment.id) await lifecycle.discard(attachment.id);
      if (!lifecycle.active(token)) return;
      setAttachments((items) =>
        items.filter((item) => item.key !== attachment.key),
      );
    } catch {
      if (lifecycle.active(token))
        Alert.alert("Could not remove attachment", "Please try again.");
    } finally {
      picking.current = false;
      if (lifecycle.active(token)) setBusy(false);
    }
  }
  async function pick(source: AttachmentSource) {
    if (picking.current) return;
    const token = lifecycle.generation();
    if (!lifecycle.active(token)) return;
    if (attachments.length >= MAX_ATTACHMENTS) {
      Alert.alert("Attachment limit", "Attach no more than 10 files.");
      return;
    }
    picking.current = true;
    setBusy(true);
    try {
      let selected: { uri: string; name: string; mediaType: string }[];
      if (source === "files") {
        const result = await DocumentPicker.getDocumentAsync({
          multiple: true,
          copyToCacheDirectory: true,
        });
        if (!lifecycle.active(token) || result.canceled) return;
        selected = result.assets.map((asset) => ({
          uri: asset.uri,
          name: asset.name,
          mediaType: asset.mimeType ?? "application/octet-stream",
        }));
      } else {
        if (source === "camera") {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!lifecycle.active(token)) return;
          if (!permission.granted) {
            Alert.alert(
              "Camera access",
              "Allow camera access in Settings to take a photo.",
            );
            return;
          }
        }
        const result =
          source === "camera"
            ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"] })
            : await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ["images"],
                allowsMultipleSelection: true,
              });
        if (!lifecycle.active(token) || result.canceled) return;
        selected = result.assets.map((asset) => ({
          uri: asset.uri,
          name: asset.fileName ?? "Photo.jpg",
          mediaType: asset.mimeType ?? "image/jpeg",
        }));
      }
      if (selected.length > MAX_ATTACHMENTS - attachments.length) {
        Alert.alert("Attachment limit", "Attach no more than 10 files.");
        return;
      }
      const added = selected.map((item) => ({
        ...item,
        key: String(nextKey.current++),
      }));
      setAttachments((items) => [...items, ...added]);
      for (const item of added) {
        if (!lifecycle.active(token)) break;
        await uploadOne(item, token);
      }
    } catch {
      if (!lifecycle.active(token)) return;
      Alert.alert(
        "Attachment unavailable",
        "This device could not open the picker. Please try again.",
      );
    } finally {
      picking.current = false;
      if (lifecycle.active(token)) setBusy(false);
    }
  }
  function markSent(ids: Id<"files">[]) {
    lifecycle.finishSend(ids, true);
    if (lifecycle.active(lifecycle.generation())) setAttachments([]);
  }
  return {
    attachments,
    pick,
    retry,
    remove,
    busy,
    beginSend: lifecycle.beginSend,
    markSent,
    sendFailed: (ids: Id<"files">[], rejected: boolean) =>
      lifecycle.finishSend(ids, false, rejected),
    isActive: () => lifecycle.active(lifecycle.generation()),
  };
}
