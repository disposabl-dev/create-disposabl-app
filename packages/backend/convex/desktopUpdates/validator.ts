import { v } from "convex/values";

export const feed = {
  app: v.string(),
  channel: v.string(),
  platform: v.string(),
  arch: v.string(),
};
export const publication = {
  ...feed,
  version: v.string(),
  build: v.number(),
  filename: v.string(),
  storageId: v.id("_storage"),
  sha256: v.string(),
  sha1: v.string(),
  size: v.number(),
};

export const resolvedUpdate = v.union(
  v.null(),
  v.object({
    version: v.string(),
    filename: v.string(),
    sha1: v.string(),
    size: v.number(),
    url: v.string(),
  }),
);
