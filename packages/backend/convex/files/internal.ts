import { createRegister } from "@disposabl/disposabl-kit/server/files-functions";
import { requireFileWrite } from "./guard";
export const register = createRegister(requireFileWrite);
export {
  getOwned,
  forget,
} from "@disposabl/disposabl-kit/server/files-functions";
