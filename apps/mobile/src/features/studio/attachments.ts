import { useAction } from "convex/react";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { useRef, useState } from "react";
import { Alert } from "react-native";
import { api } from "../../../../../packages/backend/convex/_generated/api";
import type { Id } from "../../../../../packages/backend/convex/_generated/dataModel";
import { MAX_ATTACHMENTS } from "./attachment-policy";

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
  async function uploadOne(attachment: Attachment) {
    try {
      const file = new File(attachment.uri);
      if (!file.size || file.size > MAX_BYTES)
        throw new Error("File must be nonempty and at most 5 MiB.");
      const id = await upload({
        filename: attachment.name,
        mediaType: attachment.mediaType,
        bytes: await file.arrayBuffer(),
      });
      setAttachments((items) =>
        items.map((item) =>
          item.key === attachment.key
            ? { ...item, id, error: undefined }
            : item,
        ),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed.";
      setAttachments((items) =>
        items.map((item) =>
          item.key === attachment.key ? { ...item, error: message } : item,
        ),
      );
    }
  }
  async function retry(attachment: Attachment) {
    if (picking.current) return;
    picking.current = true;
    setBusy(true);
    try {
      await uploadOne(attachment);
    } finally {
      picking.current = false;
      setBusy(false);
    }
  }
  async function remove(attachment: Attachment) {
    if (picking.current) return;
    picking.current = true;
    setBusy(true);
    try {
      if (attachment.id) await removeFile({ id: attachment.id });
      setAttachments((items) =>
        items.filter((item) => item.key !== attachment.key),
      );
    } catch {
      Alert.alert("Could not remove attachment", "Please try again.");
    } finally {
      picking.current = false;
      setBusy(false);
    }
  }
  async function pick(source: AttachmentSource) {
    if (picking.current) return;
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
        if (result.canceled) return;
        selected = result.assets.map((asset) => ({
          uri: asset.uri,
          name: asset.name,
          mediaType: asset.mimeType ?? "application/octet-stream",
        }));
      } else {
        if (
          source === "camera" &&
          !(await ImagePicker.requestCameraPermissionsAsync()).granted
        ) {
          Alert.alert(
            "Camera access",
            "Allow camera access in Settings to take a photo.",
          );
          return;
        }
        const result =
          source === "camera"
            ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"] })
            : await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ["images"],
                allowsMultipleSelection: true,
              });
        if (result.canceled) return;
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
      for (const item of added) await uploadOne(item);
    } catch {
      Alert.alert(
        "Attachment unavailable",
        "This device could not open the picker. Please try again.",
      );
    } finally {
      picking.current = false;
      setBusy(false);
    }
  }
  return { attachments, setAttachments, pick, retry, remove, busy };
}
