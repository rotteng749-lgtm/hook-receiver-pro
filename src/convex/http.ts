/**
 * Public HTTP API for the file server.
 *
 * Spec: "File server / download server v1". Date: 2026-08-15.
 * How to run: `bun convex dev --once` (local) or `bunx convex deploy`
 * (production). Routes are served at https://<deployment>.convex.site.
 *
 * Routes:
 *   GET    /health            → public status
 *   POST   /api/login         → public, {username,password} → {token} (24 h)
 *   POST   /api/files         → admin (Bearer), multipart upload
 *   GET    /api/files         → admin (Bearer), list all files
 *   DELETE /api/files/:id     → admin (Bearer), delete a file
 *   GET    /files/:id         → public, download (stream ≤15 MB, else 302)
 *
 * Limits: Convex HTTP actions cap request/response at 20 MB, so API uploads
 * are capped at 15 MB. Use the admin panel for larger files — it uploads
 * straight to object storage via presigned URLs (up to MAX_UPLOAD_MB).
 */
import { httpRouter } from "convex/server";
import type { GenericActionCtx } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { auth } from "./auth";
import { contentTypeFor, sanitizeFilename } from "./files";

const http = httpRouter();

auth.addHttpRoutes(http);

/** Admin credentials — set ADMIN_USERNAME / ADMIN_PASSWORD in the Convex
 *  dashboard. Defaults are for local development only. */
const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin123";

/** API uploads go through an HTTP action → capped by Convex's 20 MB limit.
 *  Keep a safety margin. */
const MAX_API_UPLOAD_BYTES = 15 * 1024 * 1024;
/** Files at or under this size are streamed through the action so the
 *  download responds 200 with Content-Disposition: attachment. Bigger files
 *  are answered with a 302 redirect to the signed storage URL. */
const STREAM_DOWNLOAD_LIMIT = 15 * 1024 * 1024;
/** Login rate limit: failed attempts per IP per minute. */
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_TTL_MS = 24 * 60 * 60 * 1000;

const JSON_HEADERS: Record<string, string> = { "Content-Type": "application/json" };
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Checksum-Sha256, Content-Disposition",
  "Access-Control-Max-Age": "86400",
};

/** Spec §5: basic security header on every response. */
const SECURITY_HEADERS: Record<string, string> = { "X-Content-Type-Options": "nosniff" };

/** Access log to stdout: [timestamp] METHOD path status bytes. */
function accessLog(request: Request, status: number, bytes: number | string): void {
  const url = new URL(request.url);
  console.log(
    `[${new Date().toISOString()}] ${request.method.toUpperCase()} ${url.pathname} ${status} ${bytes}`,
  );
}

function json(payload: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...JSON_HEADERS, ...SECURITY_HEADERS, ...CORS_HEADERS, ...extra },
  });
}

/** Constant-time string comparison. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** Safe filename for Content-Disposition (no quotes/control chars). */
function dispositionName(name: string): string {
  const safe = sanitizeFilename(name).replace(/[",;]/g, "");
  return safe.length === 0 ? "download" : safe;
}

/** Validate the Bearer token, return the token doc or an error response. */
async function requireToken(ctx: GenericActionCtx<any>, request: Request) {
  const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (bearer.length === 0) {
    return { ok: false as const, response: json({ error: "missing token" }, 401) };
  }
  const tokenHash = await sha256Hex(bearer);
  const token = await ctx.runQuery(internal.files.getTokenByHash, { tokenHash });
  if (token === null) {
    return { ok: false as const, response: json({ error: "invalid or expired token" }, 401) };
  }
  return { ok: true as const, token };
}

/* ------------------------------ public ------------------------------ */

const health = httpAction(async (ctx, request) => {
  accessLog(request, 200, "-");
  return json({ status: "ok" });
});

/**
 * Public download: GET /files/:id
 * Small files are proxied through this action (200, attachment headers,
 * X-Checksum-Sha256). Large files redirect (302) to the signed storage URL.
 */
const download = httpAction(async (ctx, request) => {
  const fileId = new URL(request.url).pathname.replace(/^\/files\//, "").split("/")[0];
  if (fileId.length === 0) return json({ error: "missing file id" }, 400);
  const file = await ctx.runQuery(internal.files.getAny, { fileId: fileId as Id<"files"> });
  if (file === null) return json({ error: "file not found" }, 404);

  // Best-effort counter; never blocks the download.
  await ctx.runMutation(internal.files.incrementDownload, {
    fileId: file._id,
  }).catch(() => undefined);

  const storageUrl = await ctx.storage.getUrl(file.storageId);
  if (storageUrl === null) {
    return json({ error: "file missing from storage" }, 404);
  }

  const attachment = `attachment; filename="${dispositionName(file.name)}"`;
  if (file.size > 0 && file.size <= STREAM_DOWNLOAD_LIMIT) {
    try {
      const res = await fetch(storageUrl);
      if (!res.ok) throw new Error(`storage responded ${res.status}`);
      const buffer = await res.arrayBuffer();
      accessLog(request, 200, buffer.byteLength);
      return new Response(buffer, {
        status: 200,
        headers: {
          "Content-Type": file.contentType || "application/octet-stream",
          "Content-Length": String(buffer.byteLength),
          "Content-Disposition": attachment,
          "X-Checksum-Sha256": file.sha256,
          "Cache-Control": "public, max-age=3600",
          ...SECURITY_HEADERS,
          ...CORS_HEADERS,
        },
      });
    } catch (error) {
      console.error("streaming download failed, falling back to redirect:", error);
    }
  }

  // Large file (or streaming failure): redirect to the signed URL.
  accessLog(request, 302, file.size);
  return new Response(null, {
    status: 302,
    headers: {
      Location: storageUrl,
      "Content-Disposition": attachment,
      "X-Checksum-Sha256": file.sha256,
      "Cache-Control": "no-store",
      ...SECURITY_HEADERS,
      ...CORS_HEADERS,
    },
  });
});

/* ------------------------------ login ------------------------------ */

const login = httpAction(async (ctx, request) => {
  const ip = clientIp(request);
  const now = Date.now();

  const attempts = await ctx.runQuery(internal.files.countLoginAttempts, {
    ip,
    since: now - 60_000,
  });
  if (attempts >= MAX_LOGIN_ATTEMPTS) {
    return json({ error: "too many attempts, try again later" }, 429);
  }

  let body: { username?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "expected JSON body {username, password}" }, 400);
  }
  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";

  const userOk = constantTimeEqual(username, ADMIN_USERNAME);
  const passHash = await sha256Hex(password);
  const expectedHash = await sha256Hex(ADMIN_PASSWORD);
  if (!userOk || !constantTimeEqual(passHash, expectedHash)) {
    await ctx.runMutation(internal.files.recordLoginAttempt, { ip });
    return json({ error: "invalid username or password" }, 401);
  }

  const token = randomToken();
  const expiresAt = now + LOGIN_TTL_MS;
  await ctx.runMutation(internal.files.insertApiToken, {
    tokenHash: await sha256Hex(token),
    label: "api-login",
    expiresAt,
  });
  return json({ token, expiresAt });
});

/* ---------------------------- admin files ---------------------------- */

const upload = httpAction(async (ctx, request) => {
  const auth = await requireToken(ctx, request);
  if (!auth.ok) return auth.response;

  if (!(request.headers.get("content-type") || "").includes("multipart/form-data")) {
    return json({ error: "expected multipart/form-data with a file field" }, 400);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "could not parse multipart body" }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return json({ error: "missing file field" }, 400);
  }
  if (file.size === 0) {
    return json({ error: "file is empty" }, 400);
  }
  if (file.size > MAX_API_UPLOAD_BYTES) {
    return json(
      {
        error: "file too large for the API",
        hint: "the REST API is capped at 15 MB (Convex HTTP action limit); use the admin panel for larger files",
      },
      413,
    );
  }

  const rawName = (form.get("name") as string | null)?.trim() || file.name;
  const name = sanitizeFilename(rawName);
  const version = (form.get("version") as string | null)?.trim() || undefined;
  const note = (form.get("note") as string | null)?.trim() || undefined;
  const contentType = contentTypeFor(name);

  const bytes = await file.arrayBuffer();
  const storageId = await ctx.storage.store(
    new Blob([bytes], { type: contentType }),
  );
  const sha256 = await sha256Buffer(bytes);

  const id = await ctx.runMutation(internal.files.insertFile, {
    name,
    version,
    note,
    size: bytes.byteLength,
    sha256,
    contentType,
    storageId,
  });

  accessLog(request, 201, bytes.byteLength);
  const origin = new URL(request.url).origin;
  return json({
    id,
    name,
    version: version ?? null,
    note: note ?? null,
    size: bytes.byteLength,
    sha256,
    contentType,
    url: `${origin}/files/${id}`,
  }, 201);
});

/** sha256 of a binary ArrayBuffer (hex). */
async function sha256Buffer(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const listFiles = httpAction(async (ctx, request) => {
  const auth = await requireToken(ctx, request);
  if (!auth.ok) return auth.response;
  accessLog(request, 200, "-");
  const files = await ctx.runQuery(internal.files.listAll);
  const origin = new URL(request.url).origin;
  return json(
    files.map((f) => ({
      id: f._id,
      name: f.name,
      version: f.version ?? null,
      note: f.note ?? null,
      size: f.size,
      sha256: f.sha256,
      contentType: f.contentType,
      created_at: f._creationTime,
      download_count: f.downloadCount,
      url: `${origin}/files/${f._id}`,
    })),
  );
});

const deleteFile = httpAction(async (ctx, request) => {
  const auth = await requireToken(ctx, request);
  if (!auth.ok) return auth.response;
  const fileId = new URL(request.url).pathname.replace(/^\/api\/files\//, "").split("/")[0];
  if (fileId.length === 0) return json({ error: "missing file id" }, 400);
  const deleted = await ctx.runMutation(internal.files.deleteFileById, {
    fileId: fileId as Id<"files">,
  });
  if (!deleted) return json({ error: "file not found" }, 404);
  accessLog(request, 200, "-");
  return json({ deleted: true, id: fileId });
});

/* ------------------------------ CORS ------------------------------ */

const preflight = httpAction(async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
});

/* ---------------------------- routes ---------------------------- */

http.route({ path: "/health", method: "GET", handler: health });

http.route({ path: "/api/login", method: "POST", handler: login });

http.route({ path: "/api/files", method: "POST", handler: upload });
http.route({ path: "/api/files", method: "GET", handler: listFiles });
http.route({ pathPrefix: "/api/files/", method: "DELETE", handler: deleteFile });

http.route({ pathPrefix: "/files/", method: "GET", handler: download });

http.route({ pathPrefix: "/api/", method: "OPTIONS", handler: preflight });
http.route({ pathPrefix: "/files/", method: "OPTIONS", handler: preflight });

export default http;
