/**
 * File server backend.
 *
 * Spec: "File server / download server v1" (upload, manage, and serve any
 * file type with SHA-256 integrity + admin auth). Date: 2026-08-15.
 * How to run: this is a Convex backend — run `bun convex dev --once` for
 * local codegen, or `bunx convex deploy` for production. The HTTP API
 * (login, files CRUD, public download) lives in convex/http.ts and is served
 * at https://<deployment>.convex.site. The admin UI in src/pages talks to
 * this module through the generated client.
 *
 * Design notes:
 * - Uploads from the UI use presigned upload URLs (arbitrarily large files,
 *   capped by MAX_UPLOAD_MB, default 512). The REST API path is capped by
 *   Convex's 20 MB HTTP action limit (see http.ts).
 * - SHA-256 is always computed server-side by the `computeSha256` action
 *   (Node runtime, streaming hash) after the bytes are in storage.
 * - Stored filenames are never derived from user input — downloads go
 *   through the server-generated file id, so path traversal is impossible.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";

/** Maximum upload size, configurable via MAX_UPLOAD_MB (default 512 MB). */
export function getMaxUploadBytes(): number {
  const raw = process.env.MAX_UPLOAD_MB ?? "512";
  const mb = Number.parseInt(raw, 10);
  if (!Number.isFinite(mb) || mb <= 0) return 512 * 1024 * 1024;
  return mb * 1024 * 1024;
}

/** Map a file extension to a download Content-Type. Unknown → octet-stream. */
const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  ".apk": "application/vnd.android.package-archive",
  ".sh": "text/x-shellscript",
  ".dll": "application/octet-stream",
  ".so": "application/octet-stream",
  ".zip": "application/zip",
  ".json": "application/json",
  ".txt": "text/plain",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
};

export function contentTypeFor(name: string): string {
  const ext = extensionOf(name).toLowerCase();
  return CONTENT_TYPE_BY_EXT[ext] ?? "application/octet-stream";
}

export function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot);
}

/**
 * Strip anything that could be abused: path separators, control characters,
 * quotes. Keeps a single trailing extension so the served filename is safe.
 */
export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f]/g, "") // control chars
    .replace(/["\\]/g, "")
    .replace(/^[.\s]+/, "") // no leading dots/spaces
    .trim()
    .slice(0, 120);
  return cleaned.length === 0 ? "file" : cleaned;
}

/** Canonical game key used for loader files + /connect game matching. */
export const GAME_KEYS = ["MLBB", "FREEFIRE", "PUBG"] as const;
export type GameKey = (typeof GAME_KEYS)[number];

/** Normalize any client-provided game string to a canonical key.
 *  "MLBB" / "Mobile Legends" → MLBB · "FF" / "Free Fire" → FREEFIRE ·
 *  "PUBG" / "PUBG Mobile" → PUBG. Unknown values pass through uppercased. */
export function normalizeGame(raw: string): string {
  const s = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.startsWith("MOBILELEGENDS") || s === "ML" || s === "MLBB") return "MLBB";
  if (
    s.startsWith("FREEFIRE") ||
    s === "FF" ||
    s === "FREE"
  )
    return "FREEFIRE";
  if (s.startsWith("PUBG") || s === "BGMI") return "PUBG";
  return s.slice(0, 24);
}

/** Public settings the panel shows (upload limit). */
export const getSettings = query({
  args: {},
  handler: async () => {
    return {
      maxUploadBytes: getMaxUploadBytes(),
      maxUploadMb: Math.round(getMaxUploadBytes() / (1024 * 1024)),
    };
  },
});

/** Step 1 of UI uploads: a short-lived presigned URL for direct upload. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    return await ctx.storage.generateUploadUrl();
  },
});

/** Step 3 of UI uploads: register metadata for an uploaded blob. */
export const registerFile = mutation({
  args: {
    storageId: v.id("_storage"),
    name: v.string(),
    version: v.optional(v.string()),
    note: v.optional(v.string()),
    size: v.number(),
    contentType: v.string(),
    game: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    if (args.size > getMaxUploadBytes()) {
      throw new Error(
        `File exceeds the ${Math.round(getMaxUploadBytes() / (1024 * 1024))} MB upload limit`,
      );
    }
    const name = sanitizeFilename(args.name);
    return await ctx.db.insert("files", {
      name,
      extension: extensionOf(name),
      version: args.version?.trim() || undefined,
      note: args.note?.trim() || undefined,
      size: args.size,
      sha256: "",
      contentType: args.contentType || contentTypeFor(name),
      storageId: args.storageId,
      downloadCount: 0,
      ownerId: userId,
      game: args.game ? normalizeGame(args.game) : undefined,
    });
  },
});

/** All files, newest first (single shared server — all admins see all files). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db.query("files").order("desc").collect();
  },
});

export const get = query({
  args: { id: v.id("files") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    return await ctx.db.get(id);
  },
});

/** Latest loader/APK file for a game (used by the /connect response). */
export const getLoaderForGame = internalQuery({
  args: { game: v.string() },
  handler: async (ctx, { game }) => {
    return await ctx.db
      .query("files")
      .withIndex("by_game", (q) => q.eq("game", game))
      .order("desc")
      .first();
  },
});

/** Delete a file: removes the bytes from storage and the metadata row. */
export const remove = mutation({
  args: { id: v.id("files") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const file = await ctx.db.get(id);
    if (file === null) throw new Error("File not found");
    await ctx.storage.delete(file.storageId);
    await ctx.db.delete(id);
  },
});

/* ------------------------------------------------------------------ *
 * API tokens (Bearer auth for the REST API)                          *
 * ------------------------------------------------------------------ */

const TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 1 year for panel-created tokens
const LOGIN_TTL_MS = 24 * 60 * 60 * 1000; // /api/login tokens: 24 h

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes); // 64 hex chars, 256 bits
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** sha256 hex digest — token lookup key, never store the raw token. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Create a token from the panel (shown to the user exactly once). */
export const createApiToken = mutation({
  args: { label: v.optional(v.string()) },
  handler: async (ctx, { label }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const token = randomToken();
    const now = Date.now();
    await ctx.db.insert("apiTokens", {
      tokenHash: await hashToken(token),
      label: label?.trim() || "panel",
      createdAt: now,
      expiresAt: now + TOKEN_TTL_MS,
    });
    return { token, expiresAt: now + TOKEN_TTL_MS };
  },
});

export const listApiTokens = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db.query("apiTokens").order("desc").collect();
  },
});

export const revokeApiToken = mutation({
  args: { id: v.id("apiTokens") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const token = await ctx.db.get(id);
    if (token === null) throw new Error("Token not found");
    await ctx.db.delete(id);
  },
});

/* ------------------------------------------------------------------ *
 * Internal helpers (called from convex/http.ts)                      *
 * ------------------------------------------------------------------ */

export const getAny = internalQuery({
  args: { fileId: v.id("files") },
  handler: async (ctx, { fileId }) => await ctx.db.get(fileId),
});

/** All files, newest first (used by the REST API list endpoint). */
export const listAll = internalQuery({
  args: {},
  handler: async (ctx) => await ctx.db.query("files").order("desc").collect(),
});

/** Look up a token by its sha256 hash; returns null when missing/expired. */
export const getTokenByHash = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const token = await ctx.db
      .query("apiTokens")
      .withIndex("by_hash", (q) => q.eq("tokenHash", tokenHash))
      .first();
    if (token === null || token.expiresAt < Date.now()) return null;
    return token;
  },
});

export const insertFile = internalMutation({
  args: {
    name: v.string(),
    version: v.optional(v.string()),
    note: v.optional(v.string()),
    size: v.number(),
    sha256: v.string(),
    contentType: v.string(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("files", {
      name: args.name,
      extension: extensionOf(args.name),
      version: args.version,
      note: args.note,
      size: args.size,
      sha256: args.sha256,
      contentType: args.contentType,
      storageId: args.storageId,
      downloadCount: 0,
      ownerId: undefined,
    });
  },
});

export const deleteFileById = internalMutation({
  args: { fileId: v.id("files") },
  handler: async (ctx, { fileId }) => {
    const file = await ctx.db.get(fileId);
    if (file === null) return false;
    await ctx.storage.delete(file.storageId);
    await ctx.db.delete(fileId);
    return true;
  },
});

export const setChecksum = internalMutation({
  args: { fileId: v.id("files"), sha256: v.string(), size: v.number() },
  handler: async (ctx, { fileId, sha256, size }) => {
    await ctx.db.patch(fileId, { sha256, size });
  },
});

export const incrementDownload = internalMutation({
  args: { fileId: v.id("files") },
  handler: async (ctx, { fileId }) => {
    const file = await ctx.db.get(fileId);
    if (file !== null) {
      await ctx.db.patch(fileId, { downloadCount: file.downloadCount + 1 });
    }
  },
});

export const insertApiToken = internalMutation({
  args: { tokenHash: v.string(), label: v.string(), expiresAt: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.insert("apiTokens", {
      tokenHash: args.tokenHash,
      label: args.label,
      createdAt: Date.now(),
      expiresAt: args.expiresAt,
    });
  },
});

export const countLoginAttempts = internalQuery({
  args: { ip: v.string(), since: v.number() },
  handler: async (ctx, { ip, since }) => {
    const attempts = await ctx.db
      .query("loginAttempts")
      .withIndex("by_ip", (q) => q.eq("ip", ip).gt("time", since))
      .take(100);
    return attempts.length;
  },
});

export const recordLoginAttempt = internalMutation({
  args: { ip: v.string() },
  handler: async (ctx, { ip }) => {
    const cutoff = Date.now() - 10 * 60 * 1000;
    // Opportunistic cleanup of this IP's old rows.
    const old = await ctx.db
      .query("loginAttempts")
      .withIndex("by_ip", (q) => q.eq("ip", ip).lt("time", cutoff))
      .take(50);
    for (const row of old) await ctx.db.delete(row._id);
    await ctx.db.insert("loginAttempts", { ip, time: Date.now() });
  },
});
