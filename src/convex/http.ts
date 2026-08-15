/**
 * Public HTTP API for the file server.
 *
 * Spec: "File server / download server v1". Date: 2026-08-15.
 * How to run: `bun convex dev --once` (local) or `bunx convex deploy`
 * (production). Routes are served at https://<deployment>.convex.site.
 *
 * Routes:
 *   GET    /health            → public status
 *   POST   /connect           → public, validate { license, device? } (JSON)
 *   GET    /connect           → public, validate ?license=…&device=…
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
import type { Doc, Id } from "./_generated/dataModel";
import { auth } from "./auth";
import { contentTypeFor, normalizeGame, sanitizeFilename } from "./files";
import { webhook as telegramWebhook } from "./telegram";

const http = httpRouter();

auth.addHttpRoutes(http);

/** Admin credentials — set ADMIN_USERNAME / ADMIN_PASSWORD in the Convex
 *  dashboard to override. The defaults below are the owner login. */
const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "Panxcz";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "Panxxcz";

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
 * Public download: GET /files/:id or GET /databases/:id
 * Small files are proxied through this action (200, attachment headers,
 * X-Checksum-Sha256). Large files redirect (302) to the signed storage URL.
 * `/databases/…` is the "APK response URL" alias — the URL returned in the
 * /connect success payload (data.url) for the matching game's loader.
 */
const download = httpAction(async (ctx, request) => {
  const fileId = new URL(request.url)
    .pathname.replace(/^\/(files|databases)\//, "")
    .split("/")[0];
  if (fileId.length === 0) return json({ error: "missing file id" }, 400);
  let file: Doc<"files"> | null = null;
  try {
    file = await ctx.runQuery(internal.files.getAny, {
      fileId: fileId as Id<"files">,
    });
  } catch {
    // Malformed id → treat as not found, never a 500.
    file = null;
  }
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

/* ------------------------------ connect ------------------------------ */

/**
 * Public connect endpoint: a client (app, .sh script, .dll loader…) presents
 * a license key and gets validated. The app just asks the user for their
 * license key — the server is optional and inferred from the key.
 *
 * Accepted request styles — the response satisfies every client family at
 * once (see the `send` formatter below):
 *
 *   JSON body (key/license/device/hwid/action):
 *     POST /connect  { "license": "NS-…", "device": "device-abc" }
 *     POST /connect  { "key": "NS-…", "hwid": "android-id", "game": "Free Fire" }
 *       (primebit-style FF_KERNEL / ML-KERNEL loaders — `hwid` binds 1 key = 1 device)
 *
 *   Havest-style form (game/version/user_key/serial/resource):
 *     POST /connect  application/x-www-form-urlencoded
 *     game=MLBB&version=1.0&user_key=NS-…&serial=device-abc&resource=menu
 *
 *   GET /connect?license=…&device=…[&action=reset]  (JSON shape)
 *
 * `device` / `hwid` / `serial` is optional but recommended: each key is
 * bound to the FIRST device that connects (1 key = 1 device). `action:
 * "reset"` unbinds the key from its device (only the bound device can
 * reset). Every attempt is logged (IP, user agent, device, result).
 */
const connect = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  let key = "";
  let serverRef = "";
  let device = "";
  let wantsReset = false;
  let game = "";
  let version = "";
  let resource = "";

  if (request.method === "POST") {
    const contentType = (request.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("application/x-www-form-urlencoded")) {
      // Havest-style: game=MLBB&version=1.0&user_key=…&serial=…&resource=…
      const params = new URLSearchParams(await request.text());
      key = (
        params.get("user_key") ??
        params.get("key") ??
        params.get("license") ??
        ""
      ).trim();
      serverRef = (params.get("server") ?? "").trim();
      device = (
        params.get("serial") ??
        params.get("hwid") ??
        params.get("device") ??
        ""
      )
        .trim()
        .slice(0, 128);
      wantsReset =
        params.get("action") === "reset" ||
        params.get("reset") === "true" ||
        params.get("reset") === "1";
      game = (params.get("game") ?? "").trim().slice(0, 32);
      version = (params.get("version") ?? "").trim().slice(0, 32);
      resource = (params.get("resource") ?? "").trim().slice(0, 128);
    } else {
      // JSON body — key / license / licenseKey / license_key aliases.
      let body: unknown;
      try {
        body = JSON.parse(await request.text());
      } catch {
        return json({ ok: false, error: "expected a JSON body with a key" }, 400);
      }
      const obj = body as Record<string, unknown>;
      const rawKey =
        typeof obj.key === "string"
          ? obj.key
          : typeof obj.license === "string"
            ? obj.license
            : typeof obj.licenseKey === "string"
              ? obj.licenseKey
              : typeof obj.license_key === "string"
                ? obj.license_key
                : "";
      key = rawKey.trim();
      serverRef = typeof obj.server === "string" ? obj.server.trim() : "";
      device = (
        typeof obj.hwid === "string"
          ? obj.hwid
          : typeof obj.device === "string"
            ? obj.device
            : ""
      )
        .trim()
        .slice(0, 128);
      wantsReset =
        (typeof obj.action === "string" && obj.action.trim() === "reset") ||
        obj.reset === true ||
        obj.reset === "true";
      game = typeof obj.game === "string" ? obj.game.trim().slice(0, 32) : "";
      version = typeof obj.version === "string" ? obj.version.trim().slice(0, 32) : "";
      resource = typeof obj.resource === "string" ? obj.resource.trim().slice(0, 128) : "";
    }
  } else {
    key = (
      url.searchParams.get("key") ??
      url.searchParams.get("license") ??
      url.searchParams.get("license_key") ??
      url.searchParams.get("user_key") ??
      ""
    ).trim();
    serverRef = (url.searchParams.get("server") ?? "").trim();
    device = (
      url.searchParams.get("device") ??
      url.searchParams.get("hwid") ??
      url.searchParams.get("serial") ??
      ""
    )
      .trim()
      .slice(0, 128);
    wantsReset =
      url.searchParams.get("action") === "reset" ||
      url.searchParams.get("reset") === "true" ||
      url.searchParams.get("reset") === "1";
    game = (url.searchParams.get("game") ?? "").trim().slice(0, 32);
    version = (url.searchParams.get("version") ?? "").trim().slice(0, 32);
    resource = (url.searchParams.get("resource") ?? "").trim().slice(0, 128);
  }

  // Response formatter — ONE superset shape that satisfies every client
  // family at the same time:
  //   • native JSON clients        check `ok: true`
  //   • Havest-style validators    check `status: true`
  //   • primebit-style loaders (FF_KERNEL / ML-KERNEL) search the response
  //     for the exact error substrings below; when none match it's a success,
  //     and they parse `expires` for the expiry datetime.
  const PRIMEBIT_ERRORS: Record<string, string> = {
    invalid_key: "Invalid key",
    wrong_server: "Wrong Game Key",
    server_missing: "Invalid key",
    offline: "Key banned",
    revoked: "Key banned",
    expired: "Key expired",
    usage_limit: "Key banned",
    device_mismatch: "Device limit",
    missing_device: "Device limit",
  };
  const primebitError = (reason: string) =>
    PRIMEBIT_ERRORS[reason] ?? "Invalid key";
  const NEVER_EXPIRES = "2099-12-31 23:59:59";
  const formatDate = (ms: number) => {
    const d = new Date(ms);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(
      d.getUTCDate(),
    )} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
  };
  const send = (body: Record<string, unknown>, status = 200) => {
    if (body.ok === true) {
      const server = body.server as Record<string, unknown> | undefined;
      const key = body.key as Record<string, unknown> | undefined;
      const url = typeof body.url === "string" ? body.url : undefined;
      const expiresAt =
        key !== undefined && typeof key.expiresAt === "number"
          ? key.expiresAt
          : 0;
      return json(
        {
          ok: true,
          status: true,
          message: body.message ?? "success",
          expires: expiresAt > 0 ? formatDate(expiresAt) : NEVER_EXPIRES,
          expiresAt,
          expires_ts: expiresAt > 0 ? Math.floor(expiresAt / 1000) : 4102444800,
          data:
            server !== undefined
              ? { server, key, url: url ?? null }
              : undefined,
          server,
          key,
          url: url ?? null,
        },
        status,
      );
    }
    const error =
      typeof body.error === "string" && body.error.length > 0
        ? body.error
        : "Invalid key";
    return json(
      {
        ok: false,
        status: "error",
        error,
        message:
          typeof body.message === "string" && body.message.length > 0
            ? body.message
            : error,
      },
      status,
    );
  };

  if (key.length === 0) {
    return send({ ok: false, error: "Invalid key", message: "missing key" }, 400);
  }

  const ip = clientIp(request);
  const ua = request.headers.get("user-agent") ?? undefined;

  // `server` is optional — when omitted it is inferred from the key.
  let server: Doc<"servers"> | null = null;
  if (serverRef.length > 0) {
    server = await ctx.runQuery(internal.nameserver.getServerByCode, {
      code: serverRef.toLowerCase(),
    });
    if (server === null) {
      await ctx.runMutation(internal.nameserver.recordConnect, {
        key,
        ip,
        userAgent: ua,
        deviceId: device || undefined,
        game,
        version,
        resource,
        ok: false,
        reason: "server_not_found",
      });
      accessLog(request, 404, "-");
      return send(
        { ok: false, error: "Invalid key", message: "server not found" },
        404,
      );
    }
  }

  const settings = await ctx.runQuery(internal.nameserver.getSettingsInternal, {});
  if (settings?.maintenance) {
    await ctx.runMutation(internal.nameserver.recordConnect, {
      key,
      serverId: server?._id,
      ip,
      userAgent: ua,
      deviceId: device || undefined,
      game,
      version,
      resource,
      ok: false,
      reason: "maintenance",
    });
    accessLog(request, 503, "-");
    return send(
      {
        ok: false,
        error: "Key banned",
        message: settings.downMessage || "server under maintenance",
      },
      503,
    );
  }
  if (server !== null && server.status === "off") {
    await ctx.runMutation(internal.nameserver.recordConnect, {
      key,
      serverId: server._id,
      ip,
      userAgent: ua,
      deviceId: device || undefined,
      game,
      version,
      resource,
      ok: false,
      reason: "offline",
    });
    accessLog(request, 403, "-");
    return send(
      { ok: false, error: "Key banned", message: "server is offline" },
      403,
    );
  }

  const keyDoc = await ctx.runQuery(internal.nameserver.getKeyByValue, { key });
  const fail = async (status: number, reason: string, error: string) => {
    await ctx.runMutation(internal.nameserver.recordConnect, {
      key,
      serverId: server?._id,
      ip,
      userAgent: ua,
      deviceId: device || undefined,
      game,
      version,
      resource,
      ok: false,
      reason,
    });
    accessLog(request, status, "-");
    return send(
      { ok: false, error: primebitError(reason), message: error },
      status,
    );
  };

  if (keyDoc === null) return await fail(401, "invalid_key", "invalid key");
  if (serverRef.length > 0 && keyDoc.serverId !== server!._id) {
    return await fail(401, "wrong_server", "key does not belong to this server");
  }
  if (server === null) {
    // No server code was sent — derive the server from the key itself.
    const inferred = await ctx.runQuery(internal.nameserver.getServerById, {
      serverId: keyDoc.serverId,
    });
    if (inferred === null) {
      return await fail(403, "server_missing", "the server for this key no longer exists");
    }
    if (inferred.status === "off") {
      return await fail(403, "offline", "server is offline");
    }
    server = inferred;
  }
  if (keyDoc.status === "revoked") {
    return await fail(403, "revoked", "key has been revoked");
  }
  if (keyDoc.expiresAt > 0 && Date.now() > keyDoc.expiresAt) {
    return await fail(403, "expired", "key has expired");
  }
  if (keyDoc.maxUses > 0 && keyDoc.uses >= keyDoc.maxUses) {
    return await fail(403, "usage_limit", "key has reached its usage limit");
  }

  // Reset the device binding: the currently-bound device may unbind itself
  // so the key can move to a new machine (or rebind on this one). Panel
  // users can also unbind from the Keys page — the bound device id is not
  // needed there.
  if (wantsReset) {
    if (keyDoc.deviceId === undefined) {
      await ctx.runMutation(internal.nameserver.recordConnect, {
        keyId: keyDoc._id,
        key,
        serverId: server._id,
        ip,
        userAgent: ua,
        deviceId: device || undefined,
        game,
        version,
        resource,
        ok: true,
        reason: "reset_already_unbound",
        countUse: false,
      });
      accessLog(request, 200, "-");
      return send({
        ok: true,
        action: "reset",
        message: "key is not bound to a device",
      });
    }
    if (device.length === 0) {
      return await fail(
        400,
        "missing_device",
        "send the bound device id to reset it",
      );
    }
    if (device !== keyDoc.deviceId) {
      return await fail(403, "device_mismatch", "key is bound to another device");
    }
    await ctx.runMutation(internal.nameserver.resetKeyDeviceInternal, {
      keyId: keyDoc._id,
    });
    await ctx.runMutation(internal.nameserver.recordConnect, {
      keyId: keyDoc._id,
      key,
      serverId: server._id,
      ip,
      userAgent: ua,
      deviceId: device,
      game,
      version,
      resource,
      ok: true,
      reason: "device_reset",
      countUse: false,
    });
    accessLog(request, 200, "-");
    return send({
      ok: true,
      action: "reset",
      message: "device unbound — the key can now connect from a new device",
    });
  }

  // 1 key = 1 device: reject a different device once the key is bound.
  if (keyDoc.deviceId !== undefined && keyDoc.deviceId !== device) {
    return await fail(403, "device_mismatch", "key is bound to another device");
  }

  // The "APK response URL": if a loader/APK file is uploaded for this
  // game (Databases page), point the client at it so it can download the
  // loader after a successful connect.
  let loaderUrl: string | null = null;
  if (game.length > 0) {
    const loader = await ctx.runQuery(internal.files.getLoaderForGame, {
      game: normalizeGame(game),
    });
    if (loader !== null) {
      loaderUrl = `${new URL(request.url).origin}/databases/${loader._id}`;
    }
  }

  await ctx.runMutation(internal.nameserver.recordConnect, {
    keyId: keyDoc._id,
    key,
    serverId: server._id,
    ip,
    userAgent: ua,
    deviceId: device || undefined,
    game,
    version,
    resource,
    ok: true,
    bindDevice: true,
  });
  accessLog(request, 200, "-");
  return send({
    ok: true,
    server: { name: server.name, code: server.code },
    key: {
      expiresAt: keyDoc.expiresAt,
      uses: keyDoc.uses + 1,
      maxUses: keyDoc.maxUses,
    },
    url: loaderUrl,
    message: "connected",
  });
});

/* ------------------------------ CORS ------------------------------ */

const preflight = httpAction(async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
});

/* ---------------------------- routes ---------------------------- */

http.route({ path: "/health", method: "GET", handler: health });

http.route({ path: "/connect", method: "POST", handler: connect });
http.route({ path: "/connect", method: "GET", handler: connect });

http.route({ path: "/api/login", method: "POST", handler: login });

http.route({ path: "/api/files", method: "POST", handler: upload });
http.route({ path: "/api/files", method: "GET", handler: listFiles });
http.route({ pathPrefix: "/api/files/", method: "DELETE", handler: deleteFile });

http.route({ pathPrefix: "/files/", method: "GET", handler: download });
http.route({ pathPrefix: "/databases/", method: "GET", handler: download });

http.route({ path: "/telegram/webhook", method: "POST", handler: telegramWebhook });

http.route({ path: "/connect", method: "OPTIONS", handler: preflight });
http.route({ pathPrefix: "/api/", method: "OPTIONS", handler: preflight });
http.route({ pathPrefix: "/files/", method: "OPTIONS", handler: preflight });
http.route({ pathPrefix: "/databases/", method: "OPTIONS", handler: preflight });

export default http;
