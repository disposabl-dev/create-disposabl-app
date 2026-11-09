import { createUpload } from "@disposabl/disposabl-kit/server/files-functions";
import { requireFileWrite } from "./guard";
export const upload = createUpload(requireFileWrite);
export {
  getDownload,
  resolveAttachments,
  remove,
} from "@disposabl/disposabl-kit/server/files-functions";
