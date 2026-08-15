"use node";

/**
 * Node-runtime action: computes the SHA-256 checksum of an uploaded file by
 * streaming its bytes from Convex storage (no full-file buffering, safe for
 * large uploads). Only actions may live in a "use node" file.
 *
 * Spec: "File server / download server v1" — integrity (SHA-256 at upload).
 * Date: 2026-08-15.
 */
import { createHash } from "node:crypto";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

export const computeSha256 = action({
  args: { fileId: v.id("files") },
  handler: async (ctx, { fileId }) => {
    const file = await ctx.runQuery(internal.files.getAny, { fileId });
    if (file === null) throw new Error("File not found");
    const url = await ctx.storage.getUrl(file.storageId);
    if (url === null) throw new Error("File missing from storage");

    const res = await fetch(url);
    if (!res.ok || res.body === null) {
      throw new Error("Failed to read file from storage");
    }

    const hash = createHash("sha256");
    let size = 0;
    const reader = res.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
      size += value.byteLength;
    }
    const sha256 = hash.digest("hex");

    await ctx.runMutation(internal.files.setChecksum, { fileId, sha256, size });
    return { fileId, sha256, size };
  },
});
