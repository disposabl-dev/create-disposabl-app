import { v } from "convex/values";
import { httpAction } from "./_generated/server";
import {
  internalMutation,
  internalQuery,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { makeFunctionReference } from "convex/server";
import { feed, publication, resolvedUpdate } from "./desktopUpdates/validator";

const validFeed = (a: {
  app: string;
  channel: string;
  platform: string;
  arch: string;
}) =>
  /^[a-f0-9]{32}$/.test(a.app) &&
  /^[a-z0-9][a-z0-9-]*$/.test(a.channel) &&
  ((a.platform === "darwin" && a.arch === "arm64") ||
    (a.platform === "win32" && a.arch === "x64"));

export const uploadUrl = internalMutation({
  args: {},
  returns: v.string(),
  handler: (ctx) => ctx.storage.generateUploadUrl(),
});

export const publish = internalMutation({
  args: publication,
  returns: v.null(),
  handler: async (ctx, a) => {
    if (
      !validFeed(a) ||
      !Number.isSafeInteger(a.build) ||
      a.build < 1 ||
      a.version !== `1.0.${a.build}` ||
      !/^[a-zA-Z0-9._-]+$/.test(a.filename) ||
      !/^[a-f0-9]{64}$/.test(a.sha256) ||
      !/^[A-Fa-f0-9]{40}$/.test(a.sha1) ||
      !Number.isSafeInteger(a.size) ||
      a.size < 1 ||
      !(a.platform === "darwin"
        ? a.filename.endsWith(`-${a.version}.zip`)
        : a.filename.endsWith(`-${a.version}-full.nupkg`))
    )
      throw new Error("Invalid update metadata");
    const metadata = await ctx.db.system.get("_storage", a.storageId);
    if (!metadata || metadata.size !== a.size || metadata.sha256 !== a.sha256)
      throw new Error("Uploaded file does not match metadata");
    const latest = await ctx.db
      .query("desktopUpdates")
      .withIndex("by_feed_build", (q) =>
        q
          .eq("app", a.app)
          .eq("channel", a.channel)
          .eq("platform", a.platform)
          .eq("arch", a.arch),
      )
      .order("desc")
      .first();
    const existing = await ctx.db
      .query("desktopUpdates")
      .withIndex("by_feed_filename", (q) =>
        q
          .eq("app", a.app)
          .eq("channel", a.channel)
          .eq("platform", a.platform)
          .eq("arch", a.arch)
          .eq("filename", a.filename),
      )
      .unique();
    if (
      existing &&
      latest?.build === a.build &&
      existing.build === a.build &&
      existing.sha256 === a.sha256 &&
      existing.sha1 === a.sha1 &&
      existing.size === a.size
    )
      return null;
    if (existing || (latest && a.build <= latest.build))
      throw new Error("Update is not newer or filename already exists");
    await ctx.db.insert("desktopUpdates", a);
    return null;
  },
});

export const resolve = internalQuery({
  args: { ...feed, filename: v.optional(v.string()) },
  returns: resolvedUpdate,
  handler: async (ctx, a) => {
    if (!validFeed(a)) return null;
    const query = ctx.db.query("desktopUpdates");
    const row = a.filename
      ? await query
          .withIndex("by_feed_filename", (q) =>
            q
              .eq("app", a.app)
              .eq("channel", a.channel)
              .eq("platform", a.platform)
              .eq("arch", a.arch)
              .eq("filename", a.filename!),
          )
          .unique()
      : await query
          .withIndex("by_feed_build", (q) =>
            q
              .eq("app", a.app)
              .eq("channel", a.channel)
              .eq("platform", a.platform)
              .eq("arch", a.arch),
          )
          .order("desc")
          .first();
    if (!row) return null;
    const url = await ctx.storage.getUrl(row.storageId);
    return url
      ? {
          version: row.version,
          filename: row.filename,
          sha1: row.sha1,
          size: row.size,
          url,
        }
      : null;
  },
});

export const desktopUpdate = httpAction(async (ctx, request) => {
  const parts = new URL(request.url).pathname.split("/");
  if (parts.length !== 8 || parts[1] !== "desktop" || parts[2] !== "updates")
    return new Response(null, { status: 404 });
  const [, , , app, channel, platform, arch, name] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const isManifest =
    (platform === "win32" && name === "RELEASES") ||
    (platform === "darwin" && name === "RELEASES.json");
  const result = await ctx.runQuery(
    makeFunctionReference<"query">("desktopUpdates:resolve"),
    { app, channel, platform, arch, ...(isManifest ? {} : { filename: name }) },
  );
  if (!result)
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  if (!isManifest)
    return new Response(null, {
      status: 302,
      headers: { Location: result.url, "Cache-Control": "no-store" },
    });
  const asset = new URL(encodeURIComponent(result.filename), request.url).href;
  const body =
    platform === "win32"
      ? `${result.sha1} ${asset} ${result.size}\n`
      : JSON.stringify({
          currentRelease: result.version,
          releases: [
            {
              version: result.version,
              updateTo: {
                version: result.version,
                name: result.version,
                url: asset,
              },
            },
          ],
        });
  return new Response(body, {
    headers: {
      "Content-Type": platform === "win32" ? "text/plain" : "application/json",
      "Cache-Control": "no-store",
    },
  });
});
