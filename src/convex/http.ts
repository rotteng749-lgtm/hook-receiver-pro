/**
 * Public HTTP API for the file server.
 *
 * Spec: "File server / download server v1". Date: 2026-08-15.
 * How to run: `bun convex dev --once` (local) or `bunx convex deploy`
 * (production). Routes are served at https://<deployment>.convex.site.
 *
 * Routes:
 *   GET    /health            → public status
 *   POST   /connect           → public, validate { license, device? } (POST only)
 *   POST   /mod/dimz.php      → public, DIMZNEXTV2 (Free Fire) license check
 *   GET    /api/app/version   → public, ZALL RW (MLBB) app version check
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
import { md5 } from "./md5";

const http = httpRouter();

auth.addHttpRoutes(http);

/** Admin credentials — set ADMIN_USERNAME / ADMIN_PASSWORD in the Convex
 *  dashboard to override. The defaults below are the owner login. */
const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "Panxcz";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "Panxcz@2026!";

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
// No wildcard origin: CORS is only granted for a whitelist of origins (see
// corsFor below). Native clients (curl/.sh/Android) don't send an Origin
// header, so this never applies to them.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Checksum-Sha256, Content-Disposition",
  "Access-Control-Max-Age": "86400",
};

/**
 * CORS only for same-origin, localhost dev, the Convex site and Vercel
 * previews. Anything else gets no Access-Control-Allow-Origin, so browsers
 * block it. (The panel talks to Convex via the SDK, not these routes.)
 */
function corsFor(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin) return {};
  const host = new URL(request.url).host;
  const allowed =
    origin.includes(host) ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
    origin.endsWith(".convex.site") ||
    origin.endsWith(".vercel.app");
  if (!allowed) return {};
  return { "Access-Control-Allow-Origin": origin };
}

/* ------------------- in-process rate limiting (best effort) ------------------- */

const RATE_WINDOW_MS = 60_000;
/** Total /connect calls per IP per minute. */
const RATE_MAX_TOTAL = 60;
/** Failed attempts per IP per minute before 429 (brute-force guard). */
const RATE_MAX_FAILURES = 5;
const rateBuckets = new Map<string, number[]>();

/** Register a hit; returns true when the caller is over the limit. */
function rateHit(key: string, limit: number): boolean {
  const now = Date.now();
  const hits = (rateBuckets.get(key) ?? []).filter(
    (t) => now - t < RATE_WINDOW_MS,
  );
  if (hits.length >= limit) {
    rateBuckets.set(key, hits);
    return true;
  }
  hits.push(now);
  rateBuckets.set(key, hits);
  if (rateBuckets.size > 10_000) rateBuckets.clear();
  return false;
}

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
 * once (see the `send` formatter below). POST only (GET /connect → 405):
 *
 *   JSON body (key/license/device/hwid/action):
 *     POST /connect  { "license": "NS-…", "device": "device-abc" }
 *     POST /connect  { "key": "NS-…", "hwid": "android-id", "game": "Free Fire" }
 *       (primebit-style FF_KERNEL / ML-KERNEL loaders — `hwid` binds the device)
 *
 *   Havest-style form (game/version/user_key/serial/resource):
 *     POST /connect  application/x-www-form-urlencoded
 *     game=MLBB&version=1.0&user_key=NS-…&serial=device-abc&resource=menu
 *
 *   HERZ (herz_fix.sh, MLBB) form — same parsing as Havest, but the binary
 *     validates the MIGORENG response shape. Form-encoded successes get the
 *     extra fields it checks (reason, data.token, data.rng, data.tittle,
 *     data.expired, seal) — see `send` below.
 *     POST /connect  application/x-www-form-urlencoded
 *     game=MLBB&user_key=NS-…&serial=<device-id>
 *
 * `device` / `hwid` / `serial` is optional but recommended: each key binds
 * to the devices that connect, gated by `maxDevices` (1 = 1 key 1 device,
 * 0 = unlimited). `action: "reset"` unbinds the key from its devices (only
 * a bound device can reset). Every attempt is logged (IP, user agent,
 * device, result).
 */
const connect = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  let key = "";
  let serverRef = "";
  let device = "";
  // Raw device id exactly as the client sent it (NOT uppercased): the HERZ
  // binary hashes this exact string into the token, so normalizing it would
  // break the seal check.
  let rawSerial = "";
  let wantsReset = false;
  let game = "";
  let version = "";
  let resource = "";

  // Keys and device ids are normalized the same way everywhere: trimmed and
  // UPPERCASED, so `ns-…` / `Device-ABC` match their stored forms.
  const normalizeKey = (raw: string) =>
    raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().toUpperCase().slice(0, 80);
  const normalizeDevice = (raw: string) =>
    raw.trim().toUpperCase().slice(0, 128);

  const contentType = (request.headers.get("content-type") || "").toLowerCase();
  const isForm = contentType.includes("application/x-www-form-urlencoded");
  if (isForm) {
    // Havest-style: game=MLBB&version=1.0&user_key=…&serial=…&resource=…
    const params = new URLSearchParams(await request.text());
    key = normalizeKey(
      params.get("user_key") ?? params.get("key") ?? params.get("license") ?? "",
    );
    serverRef = (params.get("server") ?? "").trim();
    rawSerial = (
      params.get("serial") ?? params.get("hwid") ?? params.get("device") ?? ""
    ).trim();
    device = normalizeDevice(rawSerial);
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
      // Uniform error shape (send is defined below the parse, so inline it).
      return json(
        {
          ok: false,
          status: false,
          error: "Invalid key",
          message: "expected a JSON body with a key",
        },
        400,
        corsFor(request),
      );
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
              : typeof obj.user_key === "string"
                ? obj.user_key
                : "";
    key = normalizeKey(rawKey);
    serverRef = typeof obj.server === "string" ? obj.server.trim() : "";
    rawSerial =
      typeof obj.hwid === "string"
        ? obj.hwid.trim()
        : typeof obj.device === "string"
          ? obj.device.trim()
          : typeof obj.serial === "string"
            ? obj.serial.trim()
            : "";
    device = normalizeDevice(rawSerial);
    wantsReset =
      (typeof obj.action === "string" && obj.action.trim() === "reset") ||
      obj.reset === true ||
      obj.reset === "true";
    game = typeof obj.game === "string" ? obj.game.trim().slice(0, 32) : "";
    version = typeof obj.version === "string" ? obj.version.trim().slice(0, 32) : "";
    resource = typeof obj.resource === "string" ? obj.resource.trim().slice(0, 128) : "";
  }

  // Response formatter — ONE superset shape that satisfies every client
  // family at the same time:
  //   • native JSON clients        check `ok: true`
  //   • Havest-style validators    check `status: true`
  //   • primebit-style loaders (FF_KERNEL / ML-KERNEL) search the response
  //     for the exact error substrings below; when none match it's a success,
  //     and they parse `expires` for the expiry datetime.
  //
  // Consistency rules (recap §5): `status` is ALWAYS a boolean (true success
  // / false error), every error carries { ok, status, error, message }, the
  // three expiry fields are derived from ONE source, and `data.*` is not
  // echoed at the top level.
  const PRIMEBIT_ERRORS: Record<string, string> = {
    invalid_key: "Invalid key",
    wrong_server: "Wrong Game Key",
    server_missing: "Invalid key",
    offline: "Key banned",
    revoked: "Key banned",
    expired: "Key expired",
    usage_limit: "Key banned",
    device_mismatch: "Device limit",
    device_limit: "Device limit",
    missing_device: "Device limit",
    rate_limited: "Key banned",
  };
  const primebitError = (reason: string) =>
    PRIMEBIT_ERRORS[reason] ?? "Invalid key";
  // Forever keys are stored as expiresAt 0; clients that compare epoch ms
  // would read 0 as "expired in 1970". Always report the sentinel
  // (2099-12-31 23:59:59 UTC) so all three expiry fields stay consistent.
  const NEVER_EXPIRES_MS = 4102444799000; // 2099-12-31 23:59:59 UTC
  const formatDate = (ms: number) => {
    const d = new Date(ms);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(
      d.getUTCDate(),
    )} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
  };

  // HERZ (herz_fix.sh, MLBB) — MIGORENG response format. The binary
  // verifies `seal` against this exact MD5, compares `data.token` against
  // MD5("MLBB-<seal>-<serial>-<const>") and parses the Indonesian
  // `data.expired` string, so these constants must never change.
  const HERZ_SEAL = "96ce5f9743814c22352025eb8703fc39";
  const HERZ_CONST = "Vm8Lk7Uj2JmsjCPVPVjrLa7zgfx3uz9E";
  const INDONESIAN_MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
    "Jul", "Agt", "Sep", "Okt", "Nov", "Des",
  ];
  const formatIndonesianDate = (ms: number) => {
    const d = new Date(ms);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(d.getUTCDate())} - ${INDONESIAN_MONTHS[d.getUTCMonth()]} - ${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
  };
  const cors = corsFor(request);
  const send = (body: Record<string, unknown>, status = 200) => {
    if (body.ok === true) {
      const server = body.server as Record<string, unknown> | undefined;
      const key = body.key as Record<string, unknown> | undefined;
      const url = typeof body.url === "string" ? body.url : undefined;
      const expiresAt =
        key !== undefined && typeof key.expiresAt === "number" && key.expiresAt > 0
          ? key.expiresAt
          : NEVER_EXPIRES_MS;
      const out: Record<string, unknown> = {
        ok: true,
        status: true,
        message: body.message ?? "success",
        expires: formatDate(expiresAt),
        expiresAt,
        expires_ts: Math.floor(expiresAt / 1000),
      };
      if (server !== undefined) {
        out.data = { server, key, url: url ?? null };
      }
      // HERZ / Havest form clients (MIGORENG format): the binary validates
      // `status`, `reason`, `data.token` (non-empty), `data.rng` (server
      // unix seconds, must be within 30 s of now), `data.tittle` (non-empty)
      // and `data.expired` (Indonesian date, must be in the future), then
      // compares `seal` — so those fields are merged into the success
      // response for every form-encoded request. JSON clients are untouched.
      if (isForm) {
        out.reason = "success";
        out.seal = HERZ_SEAL;
        const data = (out.data ?? {}) as Record<string, unknown>;
        // Deterministic token the binary can verify: MD5 of
        // "MLBB-<seal>-<serial>-<const>" using the exact serial it sent.
        // Random tokens fail the binary's seal check ("Server session
        // expired"). Falls back to a random token only when no serial was
        // sent at all (no such client exists, but keep the shape valid).
        data.token =
          rawSerial.length > 0
            ? md5(`MLBB-${HERZ_SEAL}-${rawSerial}-${HERZ_CONST}`)
            : `TOKEN-${randomToken().slice(0, 6).toUpperCase()}`;
        data.rng = Math.floor(Date.now() / 1000);
        data.tittle = game.length > 0 ? game : "MLBB";
        data.expired = formatIndonesianDate(expiresAt);
        out.data = data;
      }
      if (typeof body.action === "string") out.action = body.action;
      return json(out, status, cors);
    }
    const error =
      typeof body.error === "string" && body.error.length > 0
        ? body.error
        : "Invalid key";
    return json(
      {
        ok: false,
        status: false,
        error,
        message:
          typeof body.message === "string" && body.message.length > 0
            ? body.message
            : error,
      },
      status,
      cors,
    );
  };

  if (key.length === 0) {
    return send({ ok: false, error: "Invalid key", message: "missing key" }, 400);
  }

  const ip = clientIp(request);
  const ua = request.headers.get("user-agent") ?? undefined;

  // Per-IP rate limiting (in-process best effort): cap total volume and
  // failed attempts so the endpoint can't be brute-forced.
  if (rateHit(`ip:${ip}`, RATE_MAX_TOTAL)) {
    return send(
      { ok: false, error: primebitError("rate_limited"), message: "too many requests" },
      429,
    );
  }

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
  const fail = async (status: number, reason: string, message: string) => {
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
    // Brute-force guard: 5 failed attempts per IP per minute → 429.
    if (rateHit(`fail:${ip}`, RATE_MAX_FAILURES)) {
      return send(
        { ok: false, error: primebitError("rate_limited"), message: "too many attempts, try again later" },
        429,
      );
    }
    return send(
      { ok: false, error: primebitError(reason), message },
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

  // Effective device binding state (works for keys stored before `devices`
  // existed — deviceId doubles as devices[0]). Comparisons are
  // case-insensitive, matching the normalization above.
  const boundDevices = keyDoc.devices ?? (keyDoc.deviceId ? [keyDoc.deviceId] : []);
  const knownDevice =
    device.length > 0 &&
    boundDevices.some((d) => d.toUpperCase() === device);
  const maxDevices = keyDoc.maxDevices ?? 1; // 0 = unlimited

  // Reset the device binding: a bound device may unbind itself so the key
  // can move to a new machine. Panel users can also unbind from the Keys
  // page without sending the device id.
  if (wantsReset) {
    if (boundDevices.length === 0) {
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
      return await fail(400, "missing_device", "send the bound device id to reset it");
    }
    if (!knownDevice) {
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

  // IP whitelist/blacklist check
  const ipWhitelist = keyDoc.ipWhitelist ?? [];
  const ipBlacklist = keyDoc.ipBlacklist ?? [];
  if (ipBlacklist.length > 0 && ipBlacklist.some((blocked) => ip.startsWith(blocked.trim()))) {
    await ctx.runMutation(internal.nameserver.recordConnect, { keyId: keyDoc._id, key, serverId: server._id, ip, userAgent: ua, deviceId: device, game, version, resource, ok: false, reason: "ip_blacklisted" });
    return await fail(403, "ip_blacklisted", "your IP is blacklisted");
  }
  if (ipWhitelist.length > 0 && !ipWhitelist.some((allowed) => ip.startsWith(allowed.trim()))) {
    await ctx.runMutation(internal.nameserver.recordConnect, { keyId: keyDoc._id, key, serverId: server._id, ip, userAgent: ua, deviceId: device, game, version, resource, ok: false, reason: "ip_not_whitelisted" });
    return await fail(403, "ip_not_whitelisted", "your IP is not whitelisted");
  }

  // Per-key game filtering: if a game is assigned to this key, reject mismatched games.
  const keyGame = keyDoc.game ?? "";
  if (keyGame.length > 0 && game.length > 0 && game.toUpperCase() !== keyGame.toUpperCase()) {
    await ctx.runMutation(internal.nameserver.recordConnect, { keyId: keyDoc._id, key, serverId: server._id, ip, userAgent: ua, deviceId: device, game, version, resource, ok: false, reason: "game_mismatch" });
    return await fail(403, "game_mismatch", `this key is assigned to ${keyGame} only`);
  }

  // Device gate (maxDevices semantics):
  //   • known device           → allowed, no new binding
  //   • key already bound + no device sent → explicit "missing device"
  //   • maxDevices reached     → 403 Device limit
  //   • 0 (unlimited) / free slot → allowed, bind happens in recordConnect
  if (maxDevices > 0 && boundDevices.length > 0 && device.length === 0) {
    return await fail(400, "missing_device", "missing device — this key is bound to a device");
  }
  if (device.length > 0 && !knownDevice && maxDevices > 0 && boundDevices.length >= maxDevices) {
    return await fail(403, "device_limit", "key has reached its device limit");
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

  const rec = await ctx.runMutation(internal.nameserver.recordConnect, {
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

  // Webhook notification (fire-and-forget)
  const webhookUrl = settings?.webhookUrl ?? "";
  if (webhookUrl.length > 0) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "connect",
          key,
          server: server.name,
          ip,
          device: device || null,
          game: game || null,
          timestamp: Date.now(),
        }),
      });
    } catch {
      // webhook failure is non-blocking
    }
  }

  return send({
    ok: true,
    server: { name: server.name, code: server.code },
    key: {
      expiresAt: keyDoc.expiresAt,
      uses: rec?.uses ?? keyDoc.uses,
      maxUses: keyDoc.maxUses,
      maxDevices,
      devicesCount: rec?.devicesCount ?? boundDevices.length,
    },
    url: loaderUrl,
    message: "connected",
  });
});

/* ---------------------- DIMZNEXTV2 (Free Fire) license ---------------------- */

/**
 * DIMZNEXTV2-compatible license endpoint — POST /mod/dimz.php
 *
 * Mirrors the request/response shape of limzyyxit.my.id/mod/dimz.php that the
 * DIMZNEXTV2.sh Free Fire binary talks to:
 *
 *   POST /mod/dimz.php
 *   {"game":"freefire","licence":"NS-…","nonce":"f3e978cf",
 *    "timestamp":"1786742177","uuid":"H894X6833B012345"}
 *
 *   success      → {"status":"SUCCESS","message":"ok","signature":"000…000"}
 *   maintenance  → {"status":"maintenace","message":"…"}  (typo kept —
 *                 the binary compares this exact string)
 *   any failure  → {"status":"BANNED","message":"…"}
 *
 * The binary only reads `status` and `message`; the signature is HMAC-MD5 on
 * the original but is ignored by cracked builds, so a zero signature is fine.
 * `licence` is validated against the same connect keys as /connect and `uuid`
 * binds the device (1 key = 1 device by default). Every attempt is logged in
 * the Connections table.
 */
const dimz = httpAction(async (ctx, request) => {
  const normalizeKey = (raw: string) =>
    raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().toUpperCase().slice(0, 80);
  const normalizeDevice = (raw: string) =>
    raw.trim().toUpperCase().slice(0, 128);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json(
      { status: "BANNED", message: "invalid key" },
      400,
      corsFor(request),
    );
  }
  const key = normalizeKey(
    typeof body.licence === "string"
      ? body.licence
      : typeof body.key === "string"
        ? body.key
        : "",
  );
  const device = normalizeDevice(
    typeof body.uuid === "string"
      ? body.uuid
      : typeof body.hwid === "string"
        ? body.hwid
        : "",
  );
  const game = typeof body.game === "string" ? body.game.trim().slice(0, 32) : "";

  const ip = clientIp(request);
  const ua = request.headers.get("user-agent") ?? undefined;
  const cors = corsFor(request);
  const send = (
    status: "SUCCESS" | "BANNED" | "maintenace",
    message: string,
    httpStatus = 200,
  ) =>
    json(
      status === "SUCCESS"
        ? { status, message, signature: "00000000000000000000000000000000" }
        : { status, message },
      httpStatus,
      cors,
    );
  const log = (
    ok: boolean,
    reason: string,
    keyId?: Id<"connectKeys">,
    serverId?: Id<"servers">,
  ) =>
    ctx.runMutation(internal.nameserver.recordConnect, {
      keyId,
      key,
      serverId,
      ip,
      userAgent: ua,
      deviceId: device || undefined,
      game: game || undefined,
      ok,
      reason,
      ...(ok ? { bindDevice: true } : {}),
    });

  if (key.length === 0) return send("BANNED", "invalid key");
  if (rateHit(`ip:${ip}`, RATE_MAX_TOTAL)) {
    return send("BANNED", "too many requests, try again later", 429);
  }

  const settings = await ctx.runQuery(
    internal.nameserver.getSettingsInternal,
    {},
  );
  if (settings?.maintenance) {
    await log(false, "maintenance");
    accessLog(request, 200, "-");
    return send("maintenace", settings.downMessage || "server under maintenance");
  }

  const keyDoc = await ctx.runQuery(internal.nameserver.getKeyByValue, { key });
  if (keyDoc === null) {
    await log(false, "invalid_key");
    return send("BANNED", "invalid key");
  }
  const server = await ctx.runQuery(internal.nameserver.getServerById, {
    serverId: keyDoc.serverId,
  });
  if (server === null || server.status === "off") {
    await log(false, "offline", keyDoc._id, server?._id);
    return send("BANNED", "server is offline");
  }
  if (keyDoc.status === "revoked") {
    await log(false, "revoked", keyDoc._id, server._id);
    return send("BANNED", "key has been revoked");
  }
  if (keyDoc.expiresAt > 0 && Date.now() > keyDoc.expiresAt) {
    await log(false, "expired", keyDoc._id, server._id);
    return send("BANNED", "key has expired");
  }
  if (keyDoc.maxUses > 0 && keyDoc.uses >= keyDoc.maxUses) {
    await log(false, "usage_limit", keyDoc._id, server._id);
    return send("BANNED", "key has reached its usage limit");
  }

  const boundDevices = keyDoc.devices ?? (keyDoc.deviceId ? [keyDoc.deviceId] : []);
  const knownDevice =
    device.length > 0 && boundDevices.some((d) => d.toUpperCase() === device);
  const maxDevices = keyDoc.maxDevices ?? 1; // 0 = unlimited
  // Same semantics as /connect: unlimited keys (maxDevices = 0) never demand
  // a device id and never hit a device limit.
  if (maxDevices > 0 && boundDevices.length > 0 && device.length === 0) {
    await log(false, "missing_device", keyDoc._id, server._id);
    return send("BANNED", "missing device — this key is bound to a device");
  }
  if (
    device.length > 0 &&
    !knownDevice &&
    maxDevices > 0 &&
    boundDevices.length >= maxDevices
  ) {
    await log(false, "device_limit", keyDoc._id, server._id);
    return send("BANNED", "key has reached its device limit");
  }

  await ctx.runMutation(internal.nameserver.recordConnect, {
    keyId: keyDoc._id,
    key,
    serverId: server._id,
    ip,
    userAgent: ua,
    deviceId: device || undefined,
    game: game || undefined,
    ok: true,
    bindDevice: true,
  });
  accessLog(request, 200, "-");
  return send("SUCCESS", "ok");
});

/* ------------------- ZALL RW (MLBB) app version check ------------------- */

/**
 * ZALL RW-compatible app version endpoint — GET /api/app/version
 *
 * Mirrors the response of pusat-mlbb.vercel.app/api/app/version that the
 * ZALL RW v4.7 MLBB mod APK polls on launch (no auth needed):
 *
 *   GET /api/app/version
 *   → {"forceUpdate":true,"latestVersion":"4.7","minVersion":"4.7",
 *      "downloadUrl":"https://…/databases/<id>","message":"Update …"}
 *
 * The version, message and downloadUrl come from the newest loader/APK
 * uploaded for the game on the Databases page (default MLBB, override with
 * ?game=). With no file uploaded yet: forceUpdate false, downloadUrl null.
 */
const appVersion = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const game = normalizeGame(url.searchParams.get("game") ?? "MLBB");
  const loader = await ctx.runQuery(internal.files.getLoaderForGame, { game });
  accessLog(request, 200, "-");
  if (loader === null) {
    return json({
      forceUpdate: false,
      latestVersion: "1.0",
      minVersion: "1.0",
      downloadUrl: null,
      message: "",
    });
  }
  const version = loader.version || "1.0";
  return json({
    forceUpdate: true,
    latestVersion: version,
    minVersion: version,
    downloadUrl: `${url.origin}/databases/${loader._id}`,
    message: loader.note || "Update available",
  });
});

/* ------------------------------ CORS ------------------------------ */

const preflight = httpAction(async (_ctx, request) => {
  return new Response(null, {
    status: 204,
    headers: { ...CORS_HEADERS, ...corsFor(request) },
  });
});

/** /connect is POST-only (recap §5 P8) — anything else gets a clear 405. */
const methodNotAllowed = httpAction(async (_ctx, request) => {
  accessLog(request, 405, "-");
  return json(
    {
      ok: false,
      status: false,
      error: "Invalid key",
      message: "method not allowed — /connect accepts POST only",
    },
    405,
    corsFor(request),
  );
});

/* ------------------- custom endpoint catch-all ------------------- */

/**
 * Custom endpoint handler — catches GET/POST /hook/<path> and returns
 * the response configured in the customEndpoints table. Optional auth:
 * if authRequired is true, the client must send `Authorization: Bearer <token>`
 * or `?token=<token>` matching the server-wide endpointAuthToken setting.
 */
const customEndpoint = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  // Extract path after /hook/
  const fullPath = url.pathname;
  const path = fullPath.replace(/^\/hook\//, "").replace(/\/+$/, "");

  if (path.length === 0) {
    return json({ error: "missing endpoint path — use /hook/<your-path>" }, 400);
  }

  const endpoint = await ctx.runQuery(internal.nameserver.getCustomEndpointByPath, { path });
  if (endpoint === null) {
    accessLog(request, 404, "-");
    return json({ error: `endpoint /${path} not found` }, 404);
  }

  if (!endpoint.enabled) {
    accessLog(request, 503, "-");
    return json({ error: `endpoint /${path} is disabled` }, 503);
  }

  // Method check
  if (endpoint.method !== "ANY" && request.method !== endpoint.method) {
    accessLog(request, 405, "-");
    return json({ error: `method ${request.method} not allowed — this endpoint accepts ${endpoint.method} only` }, 405);
  }

  // Auth check
  if (endpoint.authRequired) {
    const settings = await ctx.runQuery(internal.nameserver.getSettingsInternal, {});
    const expectedToken = settings?.endpointAuthToken ?? "";
    if (expectedToken.length > 0) {
      const authHeader = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
      const queryToken = url.searchParams.get("token") ?? "";
      const provided = authHeader || queryToken;
      if (!constantTimeEqual(provided, expectedToken)) {
        accessLog(request, 401, "-");
        return json({ error: "unauthorized" }, 401);
      }
    }
  }

  accessLog(request, endpoint.statusCode, "-");
  const ct = endpoint.contentType || "application/json";
  const cors = corsFor(request);

  // File-based response: serve uploaded file from Convex storage
  if (endpoint.responseType === "file" && endpoint.fileId) {
    let file: Doc<"files"> | null = null;
    try {
      file = await ctx.runQuery(internal.files.getAny, {
        fileId: endpoint.fileId as Id<"files">,
      });
    } catch {
      file = null;
    }
    if (file === null) {
      return json({ error: "linked file not found" }, 500);
    }
    const storageUrl = await ctx.storage.getUrl(file.storageId);
    if (storageUrl === null) {
      return json({ error: "file missing from storage" }, 500);
    }
    // Stream the file content through the action — serve inline, NOT as a download.
    // Convex HTTP action limit is 20 MB; use 19 MB safety margin.
    const INLINE_LIMIT = 19 * 1024 * 1024;
    if (file.size > 0 && file.size <= INLINE_LIMIT) {
      try {
        const res = await fetch(storageUrl);
        if (!res.ok) throw new Error(`storage responded ${res.status}`);
        const buffer = await res.arrayBuffer();
        const fileCt = file.contentType || ct;
        return new Response(buffer, {
          status: endpoint.statusCode,
          headers: {
            "Content-Type": fileCt,
            "Content-Length": String(buffer.byteLength),
            "Content-Disposition": "inline",
            "Cache-Control": "public, max-age=300",
            ...SECURITY_HEADERS,
            ...cors,
          },
        });
      } catch (err) {
        console.error("custom endpoint file stream failed, redirecting:", err);
      }
    }
    // Very large file: redirect to storage URL (browser will display inline)
    return new Response(null, {
      status: 302,
      headers: {
        Location: storageUrl,
        ...SECURITY_HEADERS,
        ...cors,
      },
    });
  }

  // Text-based response (default) — serve inline.
  return new Response(endpoint.body, {
    status: endpoint.statusCode,
    headers: {
      "Content-Type": ct,
      "Content-Disposition": "inline",
      "Cache-Control": "public, max-age=300",
      ...SECURITY_HEADERS,
      ...cors,
    },
  });
});

/* ---------------------------- routes ---------------------------- */

http.route({ path: "/health", method: "GET", handler: health });

http.route({ path: "/connect", method: "POST", handler: connect });
http.route({ path: "/connect", method: "GET", handler: methodNotAllowed });
http.route({ path: "/connect", method: "PUT", handler: methodNotAllowed });
http.route({ path: "/connect", method: "PATCH", handler: methodNotAllowed });
http.route({ path: "/connect", method: "DELETE", handler: methodNotAllowed });

// DIMZNEXTV2 (Free Fire) license endpoint.
http.route({ path: "/mod/dimz.php", method: "POST", handler: dimz });
http.route({ path: "/mod/dimz.php", method: "GET", handler: methodNotAllowed });

// ZALL RW (MLBB) app version check.
http.route({ path: "/api/app/version", method: "GET", handler: appVersion });

http.route({ path: "/api/login", method: "POST", handler: login });

http.route({ path: "/api/files", method: "POST", handler: upload });
http.route({ path: "/api/files", method: "GET", handler: listFiles });
http.route({ pathPrefix: "/api/files/", method: "DELETE", handler: deleteFile });

http.route({ pathPrefix: "/files/", method: "GET", handler: download });
http.route({ pathPrefix: "/databases/", method: "GET", handler: download });

http.route({ path: "/telegram/webhook", method: "POST", handler: telegramWebhook });

http.route({ path: "/connect", method: "OPTIONS", handler: preflight });
http.route({ path: "/mod/dimz.php", method: "OPTIONS", handler: preflight });
http.route({ path: "/api/", method: "OPTIONS", handler: preflight });
http.route({ pathPrefix: "/files/", method: "OPTIONS", handler: preflight });
http.route({ pathPrefix: "/databases/", method: "OPTIONS", handler: preflight });

// Custom user-created endpoints (admin creates via panel).
http.route({ pathPrefix: "/hook/", method: "GET", handler: customEndpoint });
http.route({ pathPrefix: "/hook/", method: "POST", handler: customEndpoint });
http.route({ pathPrefix: "/hook/", method: "PUT", handler: customEndpoint });
http.route({ pathPrefix: "/hook/", method: "PATCH", handler: customEndpoint });
http.route({ pathPrefix: "/hook/", method: "DELETE", handler: customEndpoint });
http.route({ pathPrefix: "/hook/", method: "OPTIONS", handler: preflight });

export default http;
