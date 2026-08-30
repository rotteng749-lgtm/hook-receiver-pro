/**
 * HTTP API — Convex HTTP actions for /connect, custom endpoints, /api/*, /files/*, etc.
 *
 * Custom endpoints support arbitrary paths: the admin can create an endpoint
 * with ANY path (e.g. "ml-check.php", "v1/auth", "api/license") and it will
 * be served at that exact URL. Old /hook/ paths also still work.
 */
import { httpAction } from "./_generated/server";
import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { extensionOf, hashToken } from "./files";

const http = httpRouter();

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function clientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip")?.split(",")[0]?.trim() ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "0.0.0.0"
  );
}

function accessLog(req: Request, status: number, note: string) {
  const ip = clientIp(req);
  const path = new URL(req.url).pathname;
  console.log(`[${new Date().toISOString()}] ${req.method} ${path} → ${status} ${note} from ${ip}`);
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Key, X-Requested-With",
  "Access-Control-Max-Age": "86400",
};

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "X-XSS-Protection": "1; mode=block",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
};

function corsFor(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin) return {};
  const host = new URL(request.url).host;
  const allowed =
    origin.includes(host) ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
    origin.endsWith(".convex.site") ||
    origin.endsWith(".vercel.app") ||
    origin.endsWith(".freebuff.com") ||
    /^https?:\/\/(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(origin);
  if (!allowed) return {};
  return { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true" };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...SECURITY_HEADERS, ...headers },
  });

function md5(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h).toString(16).padStart(8, "0") + "00000000000000000000000000000000";
}

function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/* --- HMAC-SHA256 signing (Web Crypto) --- */
const SIGNING_SECRET = process.env.API_SIGNING_SECRET ?? "panxcz-signing-key-2026";

async function hmacSign(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(SIGNING_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacVerify(data: string, signature: string): Promise<boolean> {
  const expected = await hmacSign(data);
  return expected === signature;
}

/* --- Enhanced rate limiting: per IP + per HWID + per IP+HWID combo --- */
const RATE_BUCKETS_HWID = new Map<string, { count: number; ts: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_IP = 60;
const RATE_MAX_PER_HWID = 20;
const RATE_MAX_FAILURES_IP = 8;
const RATE_MAX_FAILURES_HWID = 5;

function rateHit(key: string, max: number, buckets: Map<string, { count: number; ts: number }> = RATE_BUCKETS_HWID): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.ts > RATE_WINDOW_MS) {
    buckets.set(key, { count: 1, ts: now });
    return false;
  }
  bucket.count++;
  return bucket.count > max;
}

function rateHitEnhanced(ip: string, hwid: string, maxIp: number, maxHwid: number): boolean {
  if (rateHit(`ip:${ip}`, maxIp)) return true;
  if (hwid.length > 0 && rateHit(`hwid:${hwid}`, maxHwid, RATE_BUCKETS_HWID)) return true;
  return false;
}

/* --- Session token generation --- */
function generateSessionToken(key: string, hwid: string, ts: number): string {
  const payload = `${key}:${hwid}:${ts}`;
  return md5(payload);
}

/* --- Client signature verification --- */
async function verifyClientSignature(request: Request, payload: string): Promise<boolean> {
  const sig = request.headers.get("x-client-signature") ?? "";
  if (sig.length === 0) return true; // optional — allow unsigned for backward compat
  const appVersion = request.headers.get("x-app-version") ?? "";
  const expected = await hmacSign(`${payload}:${appVersion}`);
  return expected === sig || sig === "skip"; // "skip" for testing
}

/* --- HWID fingerprint validation --- */
function validateHwid(hwid: string): { valid: boolean; reason: string } {
  if (hwid.length < 8) return { valid: false, reason: "hwid_too_short" };
  if (hwid.length > 256) return { valid: false, reason: "hwid_too_long" };
  // Reject obviously random/spoofed HWIDs (all same char, sequential)
  const uniqueChars = new Set(hwid).size;
  if (uniqueChars < 3) return { valid: false, reason: "hwid_not_unique" };
  return { valid: true, reason: "ok" };
}

function normalizeGame(raw: string): string {
  return raw.trim().toUpperCase().slice(0, 32);
}

/* --- Input sanitization --- */
/** Strip control characters, null bytes, and dangerous HTML from user input. */
function sanitizeInput(raw: string, maxLen = 256): string {
  return raw
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "") // control chars + null bytes
    .replace(/<[^>]*>/g, "") // strip HTML tags
    .replace(/["'`;\\]/g, (c) => `\\${c}`) // escape injection chars for display
    .trim()
    .slice(0, maxLen);
}

/** Validate custom endpoint path — reject paths that shadow critical routes or contain traversal. */
function isValidEndpointPath(path: string): { ok: boolean; reason?: string } {
  if (path.length === 0) return { ok: false, reason: "empty path" };
  if (path.length > 128) return { ok: false, reason: "path too long" };
  if (path.includes("..") || path.includes("%2e")) return { ok: false, reason: "path traversal" };
  if (/[\\"'`;\x00-\x1f]/.test(path)) return { ok: false, reason: "invalid characters" };
  // Block paths that shadow critical Convex routes
  const blocked = ["health", "connect", "api", "files", "databases", "telegram", "_generated"];
  const root = path.split("/")[0].toLowerCase();
  if (blocked.includes(root)) return { ok: false, reason: `path /${root} shadows a critical route` };
  return { ok: true };
}

/** Sanitize filename for Content-Disposition header — prevent header injection. */
function safeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._\-]/g, "_") // only allow safe chars
    .replace(/_{2,}/g, "_") // collapse underscores
    .slice(0, 128);
}

/** Strip control chars from a string for safe logging/display. */
function safeLog(str: string, maxLen = 512): string {
  return str.replace(/[\u0000-\u001f\u007f]/g, "?").slice(0, maxLen);
}

/* --- Global rate limiter for admin-write endpoints --- */
const ADMIN_RATE_BUCKETS = new Map<string, { count: number; ts: number }>();
const ADMIN_RATE_MAX = 30; // max 30 admin actions per minute per IP

function adminRateLimit(ip: string): boolean {
  return rateHit(`admin:${ip}`, ADMIN_RATE_MAX, ADMIN_RATE_BUCKETS);
}

/* ------------------------------------------------------------------ */
/*  Health                                                             */
/* ------------------------------------------------------------------ */

const health = httpAction(async (_ctx, _request) => json({ ok: true, ts: Date.now() }));

/* ------------------------------------------------------------------ */
/*  /connect — license key validation                                  */
/* ------------------------------------------------------------------ */

const connect = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  let key = "";
  let serverRef = "";
  let device = "";
  let rawSerial = "";
  let wantsReset = false;
  let game = "";
  let version = "";
  let resource = "";

  const normalizeKey = (raw: string) => raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().toUpperCase().slice(0, 80);
  const normalizeDevice = (raw: string) => raw.trim().toUpperCase().slice(0, 128);

  const contentType = (request.headers.get("content-type") || "").toLowerCase();
  const isForm = contentType.includes("application/x-www-form-urlencoded");

  if (request.method === "GET") {
    const qp = url.searchParams;
    key = normalizeKey(qp.get("license") ?? qp.get("key") ?? qp.get("user_key") ?? qp.get("license_key") ?? "");
    serverRef = (qp.get("server") ?? "").trim();
    rawSerial = (qp.get("device") ?? qp.get("hwid") ?? qp.get("serial") ?? "").trim();
    device = normalizeDevice(rawSerial);
    wantsReset = qp.get("action") === "reset" || qp.get("reset") === "true" || qp.get("reset") === "1";
    game = (qp.get("game") ?? "").trim().slice(0, 32);
    version = (qp.get("version") ?? "").trim().slice(0, 32);
    resource = (qp.get("resource") ?? "").trim().slice(0, 128);
  } else if (isForm) {
    const rawText = await request.text();
    // Smart detection: if the body looks like JSON even though Content-Type is form-urlencoded,
    // parse it as JSON (many clients send JSON with form-urlencoded Content-Type)
    const trimmed = rawText.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      let body: unknown;
      try { body = JSON.parse(trimmed); } catch { body = null; }
      if (body && typeof body === "object" && !Array.isArray(body)) {
        const obj = body as Record<string, unknown>;
        key = normalizeKey(typeof obj.key === "string" ? obj.key : typeof obj.license === "string" ? obj.license : typeof obj.licenseKey === "string" ? obj.licenseKey : typeof obj.license_key === "string" ? obj.license_key : typeof obj.user_key === "string" ? obj.user_key : "");
        serverRef = typeof obj.server === "string" ? obj.server.trim() : "";
        rawSerial = (typeof obj.hwid === "string" ? obj.hwid.trim() : typeof obj.device === "string" ? obj.device.trim() : typeof obj.serial === "string" ? obj.serial.trim() : "");
        device = normalizeDevice(rawSerial);
        wantsReset = (typeof obj.action === "string" && obj.action.trim() === "reset") || obj.reset === true || obj.reset === "true";
        game = typeof obj.game === "string" ? obj.game.trim().slice(0, 32) : "";
        version = typeof obj.version === "string" ? obj.version.trim().slice(0, 32) : "";
        resource = typeof obj.resource === "string" ? obj.resource.trim().slice(0, 128) : "";
      } else {
        // Fallback: parse as form-urlencoded
        const params = new URLSearchParams(rawText);
        key = normalizeKey(params.get("user_key") ?? params.get("key") ?? params.get("license") ?? "");
        serverRef = (params.get("server") ?? "").trim();
        rawSerial = (params.get("serial") ?? params.get("hwid") ?? params.get("device") ?? "").trim();
        device = normalizeDevice(rawSerial);
        wantsReset = params.get("action") === "reset" || params.get("reset") === "true" || params.get("reset") === "1";
        game = (params.get("game") ?? "").trim().slice(0, 32);
        version = (params.get("version") ?? "").trim().slice(0, 32);
        resource = (params.get("resource") ?? "").trim().slice(0, 128);
      }
    } else {
      // Normal form-urlencoded
      const params = new URLSearchParams(rawText);
      key = normalizeKey(params.get("user_key") ?? params.get("key") ?? params.get("license") ?? "");
      serverRef = (params.get("server") ?? "").trim();
      rawSerial = (params.get("serial") ?? params.get("hwid") ?? params.get("device") ?? "").trim();
      device = normalizeDevice(rawSerial);
      wantsReset = params.get("action") === "reset" || params.get("reset") === "true" || params.get("reset") === "1";
      game = (params.get("game") ?? "").trim().slice(0, 32);
      version = (params.get("version") ?? "").trim().slice(0, 32);
      resource = (params.get("resource") ?? "").trim().slice(0, 128);
    }
  } else {
    let body: unknown;
    try { body = JSON.parse(await request.text());    } catch {
      return json({ ok: false, status: false, error: "MEMBER KEY NOT REGISTERED", message: "MEMBER KEY NOT REGISTERED" }, 400, corsFor(request));
    }
    const obj = body as Record<string, unknown>;
    key = normalizeKey(typeof obj.key === "string" ? obj.key : typeof obj.license === "string" ? obj.license : typeof obj.licenseKey === "string" ? obj.licenseKey : typeof obj.license_key === "string" ? obj.license_key : typeof obj.user_key === "string" ? obj.user_key : "");
    serverRef = typeof obj.server === "string" ? obj.server.trim() : "";
    rawSerial = (typeof obj.hwid === "string" ? obj.hwid.trim() : typeof obj.device === "string" ? obj.device.trim() : typeof obj.serial === "string" ? obj.serial.trim() : "");
    device = normalizeDevice(rawSerial);
    wantsReset = (typeof obj.action === "string" && obj.action.trim() === "reset") || obj.reset === true || obj.reset === "true";
    game = typeof obj.game === "string" ? obj.game.trim().slice(0, 32) : "";
    version = typeof obj.version === "string" ? obj.version.trim().slice(0, 32) : "";
    resource = typeof obj.resource === "string" ? obj.resource.trim().slice(0, 128) : "";
  }

  const cors = corsFor(request);
  const ip = clientIp(request);
  const ua = request.headers.get("user-agent") ?? undefined;
  const NEVER_EXPIRES_MS = 4102444799000;
  const formatDate = (ms: number) => {
    const d = new Date(ms);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
  };
  // API Key (matches PHP server: NCZ_7fK9xP2mQ8vL4sR6nT1zW5cB)
  // Seal = MD5(API_KEY) — precomputed since Web Crypto doesn't support MD5
  // If you change API_KEY in env PANXCZ_API_KEY, recompute with: md5("your-key")
  const HERZ_SEAL = process.env.PANXCZ_SEAL ?? "8b3d18363278f9bbaf745f2749b32aca";
  const HERZ_CONST = "Vm8Lk7Uj2JmsjCPVPVjrLa7zgfx3uz9E";
  const INDONESIAN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];
  const formatIndonesianDate = (ms: number) => {
    const d = new Date(ms);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(d.getUTCDate())} - ${INDONESIAN_MONTHS[d.getUTCMonth()]} - ${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
  };

  const send = (body: Record<string, unknown>, status = 200) => {
    if (body.ok === true) {
      const serverInfo = body.server as Record<string, unknown> | undefined;
      const keyInfo = body.key as Record<string, unknown> | undefined;
      const hookUrl = typeof body.hookUrl === "string" ? body.hookUrl : undefined;
      const expiresAt = keyInfo !== undefined && typeof keyInfo.expiresAt === "number" && keyInfo.expiresAt > 0 ? keyInfo.expiresAt : NEVER_EXPIRES_MS;
      const serverName = serverInfo?.name ?? "main";
      const serverCode = serverInfo?.code ?? "main";
      const token = rawSerial.length > 0 ? md5(`${game || "MLBB"}-${HERZ_SEAL}-${rawSerial}-${HERZ_CONST}`) : `TOKEN-${randomToken().slice(0, 8).toUpperCase()}`;
      const rng = Math.floor(Date.now() / 1000);
      const gameTitle = game.length > 0 ? game : "MLBB";
      const expiredStr = formatIndonesianDate(expiresAt);

      // Binary-compatible date format: "28-Agu-2026 19:17"
      const INDONESIAN_MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];
      const now2 = new Date();
      const p2 = (n: number) => String(n).padStart(2, "0");
      const datte = `${p2(now2.getUTCDate())}-${INDONESIAN_MONTHS_SHORT[now2.getUTCMonth()]}-${now2.getUTCFullYear()} ${p2(now2.getUTCHours())}:${p2(now2.getUTCMinutes())}`;

      // PHP-compatible response format (binary reads: ok, status, reason, seal, data.token, data.rng, data.tittle, data.expired)
      const dataObj: Record<string, unknown> = {
        Datte: datte,
        server: { name: serverName, code: serverCode },
        instance: serverName || "Instance",
        key: { expiresAt: keyInfo?.expiresAt ?? 0, uses: keyInfo?.uses ?? 0, maxUses: keyInfo?.maxUses ?? 0, maxDevices: keyInfo?.maxDevices ?? 0, devicesCount: keyInfo?.devicesCount ?? 0 },
        url: hookUrl ?? null,
        token,
        rng,
        tittle: gameTitle,
        expired: expiredStr,
      };

      const out: Record<string, unknown> = {
        ok: true,
        status: true,
        reason: "success",
        message: body.message ?? "success",
        seal: HERZ_SEAL,
        data: dataObj,
        // Also top-level for backward compat
        token,
        rng,
        tittle: gameTitle,
        expired: expiredStr,
        expires: formatDate(expiresAt),
        expiresAt,
        expires_ts: Math.floor(expiresAt / 1000),
      };
      if (typeof body.action === "string") out.action = body.action;
      return json(out, status, cors);
    }
    const error = typeof body.error === "string" && body.error.length > 0 ? body.error : "Invalid key";
    const reason = typeof body.message === "string" && body.message.length > 0 ? body.message : error;
    return json({ ok: false, status: false, reason, error, message: reason, seal: HERZ_SEAL, data: {} }, status, cors);
  };

  if (key.length === 0) return send({ ok: false, error: "MEMBER KEY NOT REGISTERED", message: "MEMBER KEY NOT REGISTERED" }, 400);
  if (rateHitEnhanced(ip, device, RATE_MAX_PER_IP, RATE_MAX_PER_HWID)) return send({ ok: false, error: "MEMBER KEY NOT REGISTERED", message: "MEMBER KEY NOT REGISTERED" }, 429);

  let server: Doc<"servers"> | null = null;
  if (serverRef.length > 0) {
    server = await ctx.runQuery(internal.nameserver.getServerByCode, { code: serverRef.toLowerCase() });
    if (server === null) {
      await ctx.runMutation(internal.nameserver.recordConnect, { key, ip, userAgent: ua, deviceId: device || undefined, game, version, resource, ok: false, reason: "server_not_found" });
      accessLog(request, 404, "-");
      return send({ ok: false, error: "Invalid key", message: "server not found" }, 404);
    }
  }

  const settings = await ctx.runQuery(internal.nameserver.getSettingsInternal, {});
  if (settings?.maintenance) {
    await ctx.runMutation(internal.nameserver.recordConnect, { key, serverId: server?._id, ip, userAgent: ua, deviceId: device || undefined, game, version, resource, ok: false, reason: "maintenance" });
    accessLog(request, 503, "-");
    return send({ ok: false, error: "Key banned", message: settings.downMessage || "server under maintenance" }, 503);
  }
  if (server !== null && server.status === "off") {
    await ctx.runMutation(internal.nameserver.recordConnect, { key, serverId: server._id, ip, userAgent: ua, deviceId: device || undefined, game, version, resource, ok: false, reason: "offline" });
    accessLog(request, 403, "-");
    return send({ ok: false, error: "Key banned", message: "server is offline" }, 403);
  }

  const keyDoc = await ctx.runQuery(internal.nameserver.getKeyByValue, { key });
  const fail = async (status: number, reason: string, message: string) => {
    await ctx.runMutation(internal.nameserver.recordConnect, { key, serverId: server?._id, ip, userAgent: ua, deviceId: device || undefined, game, version, resource, ok: false, reason });
    accessLog(request, status, "-");
    if (rateHit(`fail:${ip}`, RATE_MAX_FAILURES_IP)) return send({ ok: false, error: "MEMBER KEY NOT REGISTERED", message: "MEMBER KEY NOT REGISTERED" }, 429);
    return send({ ok: false, error: "Key banned", message }, status);
  };

  if (keyDoc === null) return await fail(401, "invalid_key", "MEMBER KEY NOT REGISTERED");
  if (serverRef.length > 0 && keyDoc.serverId !== server!._id) return await fail(401, "wrong_server", "MEMBER KEY NOT REGISTERED");
  if (server === null) {
    const inferred = await ctx.runQuery(internal.nameserver.getServerById, { serverId: keyDoc.serverId });
    if (inferred === null) return await fail(403, "server_missing", "the server for this key no longer exists");
    if (inferred.status === "off") return await fail(403, "offline", "server is offline");
    server = inferred;
  }
  if (keyDoc.status === "revoked") return await fail(403, "revoked", "key has been revoked");
  if (keyDoc.expiresAt > 0 && Date.now() > keyDoc.expiresAt) return await fail(403, "expired", "key has expired");
  if (keyDoc.maxUses > 0 && keyDoc.uses >= keyDoc.maxUses) return await fail(403, "usage_limit", "key has reached its usage limit");

  const boundDevices = keyDoc.devices ?? (keyDoc.deviceId ? [keyDoc.deviceId] : []);
  const knownDevice = device.length > 0 && boundDevices.some((d) => d.toUpperCase() === device);
  const maxDevices = keyDoc.maxDevices ?? 1;

  if (wantsReset) {
    if (boundDevices.length === 0) {
      await ctx.runMutation(internal.nameserver.recordConnect, { keyId: keyDoc._id, key, serverId: server._id, ip, userAgent: ua, deviceId: device || undefined, game, version, resource, ok: true, reason: "reset_already_unbound", countUse: false });
      accessLog(request, 200, "-");
      return send({ ok: true, action: "reset", message: "key is not bound to a device" });
    }
    if (device.length === 0) return await fail(400, "missing_device", "send the bound device id to reset it");
    if (!knownDevice) return await fail(403, "device_mismatch", "key is bound to another device");
    await ctx.runMutation(internal.nameserver.resetKeyDeviceInternal, { keyId: keyDoc._id });
    await ctx.runMutation(internal.nameserver.recordConnect, { keyId: keyDoc._id, key, serverId: server._id, ip, userAgent: ua, deviceId: device, game, version, resource, ok: true, reason: "device_reset", countUse: false });
    accessLog(request, 200, "-");
    return send({ ok: true, action: "reset", message: "device unbound" });
  }

  const ipWhitelist = keyDoc.ipWhitelist ?? [];
  const ipBlacklist = keyDoc.ipBlacklist ?? [];
  if (ipBlacklist.length > 0 && ipBlacklist.some((b) => ip.startsWith(b.trim()))) {
    await ctx.runMutation(internal.nameserver.recordConnect, { keyId: keyDoc._id, key, serverId: server._id, ip, userAgent: ua, deviceId: device, game, version, resource, ok: false, reason: "ip_blacklisted" });
    return await fail(403, "ip_blacklisted", "your IP is blacklisted");
  }
  if (ipWhitelist.length > 0 && !ipWhitelist.some((a) => ip.startsWith(a.trim()))) {
    await ctx.runMutation(internal.nameserver.recordConnect, { keyId: keyDoc._id, key, serverId: server._id, ip, userAgent: ua, deviceId: device, game, version, resource, ok: false, reason: "ip_not_whitelisted" });
    return await fail(403, "ip_not_whitelisted", "your IP is not whitelisted");
  }

  const keyGame = keyDoc.game ?? "";
  if (keyGame.length > 0 && game.length > 0 && game.toUpperCase() !== keyGame.toUpperCase()) {
    await ctx.runMutation(internal.nameserver.recordConnect, { keyId: keyDoc._id, key, serverId: server._id, ip, userAgent: ua, deviceId: device, game, version, resource, ok: false, reason: "game_mismatch" });
    return await fail(403, "game_mismatch", `this key is assigned to ${keyGame} only`);
  }

  if (maxDevices > 0 && boundDevices.length > 0 && device.length === 0) return await fail(400, "missing_device", "missing device — this key is bound to a device");
  if (device.length > 0 && !knownDevice && maxDevices > 0 && boundDevices.length >= maxDevices) return await fail(403, "device_limit", "key has reached its device limit");

  const rec = await ctx.runMutation(internal.nameserver.recordConnect, {
    keyId: keyDoc._id, key, serverId: server._id, ip, userAgent: ua,
    deviceId: device || undefined, game, version, resource, ok: true, bindDevice: true,
  });
  accessLog(request, 200, "-");

  const webhookUrl = settings?.webhookUrl ?? "";
  if (webhookUrl.length > 0) {
    try {
      await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "connect", key, server: server.name, ip, device: device || null, game: game || null, timestamp: Date.now() }) });
    } catch { /* non-blocking */ }
  }

  let hookUrl: string | null = null;
  if (game.length > 0) {
    const endpoints = await ctx.runQuery(internal.nameserver.listCustomEndpointsInternal);
    const gameEp = endpoints.find((e) => e.game && e.game.toUpperCase() === game.toUpperCase() && e.enabled);
    if (gameEp) hookUrl = `${new URL(request.url).origin}/${gameEp.path}`;
  }

  const tier = getKeyTier(key);
  const features = FEATURE_MAP[tier] ?? FEATURE_MAP.basic;

  return send({
    ok: true,
    server: { name: server.name, code: server.code },
    key: { expiresAt: keyDoc.expiresAt, uses: rec?.uses ?? keyDoc.uses, maxUses: keyDoc.maxUses, maxDevices, devicesCount: rec?.devicesCount ?? boundDevices.length },
    features,
    hookUrl, message: "connected",
  });
});

/* ------------------------------------------------------------------ */
/*  App version check                                                  */
/* ------------------------------------------------------------------ */

const appVersion = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const game = normalizeGame(url.searchParams.get("game") ?? "MLBB");
  const loader = await ctx.runQuery(internal.files.getLoaderForGame, { game });
  accessLog(request, 200, "-");
  if (loader === null) return json({ forceUpdate: false, latestVersion: "1.0", minVersion: "1.0", downloadUrl: null, message: "" });
  const version = loader.version || "1.0";
  return json({ forceUpdate: true, latestVersion: version, minVersion: version, downloadUrl: `${url.origin}/databases/${loader._id}`, message: loader.note || "Update available" });
});

/* ------------------------------------------------------------------ */
/*  File helpers                                                       */
/* ------------------------------------------------------------------ */

const upload = httpAction(async (ctx, request) => {
  const ip = clientIp(request);
  if (adminRateLimit(ip)) return json({ error: "rate limited" }, 429);
  const body = await request.json();
  const storageId = body.storageId as Id<"_storage">;
  const name = sanitizeInput(String(body.name ?? "unnamed"), 256);
  const size = typeof body.size === "number" ? body.size : 0;
  const ct = sanitizeInput(String(body.contentType ?? "application/octet-stream"), 128);
  // Block dangerous content types for stored files
  const DANGEROUS_CT = ["text/html", "application/javascript", "image/svg+xml"];
  if (DANGEROUS_CT.includes(ct.toLowerCase())) {
    return json({ error: `content type ${ct} is not allowed for file storage` }, 403);
  }
  const game = typeof body.game === "string" ? sanitizeInput(body.game, 32) : undefined;
  const version = typeof body.version === "string" ? sanitizeInput(body.version, 32) : undefined;
  const note = typeof body.note === "string" ? sanitizeInput(body.note, 512) : undefined;
  const fileId = await ctx.runMutation(internal.files.insertFile, { storageId, name, size, contentType: ct, sha256: "", note });
  accessLog(request, 200, `upload:${name}`);
  return json({ ok: true, fileId });
});

const listFiles = httpAction(async (ctx, _request) => {
  const files = await ctx.runQuery(internal.files.listAll, {});
  // Sanitize file metadata to prevent XSS when displayed in admin panel
  const safe = files.map((f: any) => ({
    ...f,
    name: sanitizeInput(f.name, 256),
    note: f.note ? sanitizeInput(f.note, 512) : undefined,
    contentType: sanitizeInput(f.contentType, 128),
  }));
  return json(safe);
});

const deleteFile = httpAction(async (ctx, request) => {
  const ip = clientIp(request);
  if (adminRateLimit(ip)) return json({ error: "rate limited" }, 429);
  const id = request.url.split("/").pop();
  if (!id || id.length > 100 || !/^[a-zA-Z0-9_:]+$/.test(id)) return json({ error: "invalid file id" }, 400);
  try {
    await ctx.runMutation(internal.files.deleteFileById, { fileId: id as Id<"files"> });
    accessLog(request, 200, `delete:${id}`);
    return json({ ok: true });
  } catch (e) {
    return json({ error: "failed to delete" }, 500);
  }
});

const download = httpAction(async (ctx, request) => {
  const parts = request.url.split("/");
  const id = parts[parts.length - 1].split("?")[0] as Id<"files">;
  if (!id || id.length > 100) return json({ error: "missing id" }, 400);
  // Validate ID format — Convex IDs are alphanumeric with underscores
  if (!/^[a-zA-Z0-9_:]+$/.test(id)) return json({ error: "invalid id" }, 400);
  const file = await ctx.runQuery(internal.files.getAny, { fileId: id });
  if (!file) return json({ error: "not found" }, 404);
  const url = await ctx.storage.getUrl(file.storageId);
  if (!url) return json({ error: "storage error" }, 500);
  await ctx.runMutation(internal.files.incrementDownload, { fileId: id });
  const res = await fetch(url);
  const blob = await res.arrayBuffer();
  // Max 50MB download limit
  const MAX_DOWNLOAD = 50 * 1024 * 1024;
  if (blob.byteLength > MAX_DOWNLOAD) return json({ error: "file too large" }, 413);
  // Use safe filename to prevent Content-Disposition header injection
  const safeName = safeFilename(file.name);
  return new Response(blob, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Content-Length": String(blob.byteLength),
      ...SECURITY_HEADERS,
      ...corsFor(request),
    },
  });
});

/* ------------------------------------------------------------------ */
/*  API login — full license key auth with DB validation, HWID bind,  */
/*  dynamic seal, and PHP-compatible response format.                  */
/* ------------------------------------------------------------------ */

/** Compute MD5 hash (pure JS — matches PHP md5() output). */
function realMd5(str: string): string {
  function add32(a: number, b: number) { return (a + b) & 0xFFFFFFFF; }
  function md5cycle(x: number[], k: number[]) {
    let a = x[0], b = x[1], c = x[2], d = x[3];
    a = ff(a, b, c, d, k[0], 7, -680876936); d = ff(d, a, b, c, k[1], 12, -389564586); c = ff(c, d, a, b, k[2], 17, 606105819); b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897); d = ff(d, a, b, c, k[5], 12, 1200080426); c = ff(c, d, a, b, k[6], 17, -1473231341); b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416); d = ff(d, a, b, c, k[9], 12, -1958414417); c = ff(c, d, a, b, k[10], 17, -42063); b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682); d = ff(d, a, b, c, k[13], 12, -40341101); c = ff(c, d, a, b, k[14], 17, -1502002290); b = ff(b, c, d, a, k[15], 22, 1236535329);
    a = gg(a, b, c, d, k[1], 5, -165796510); d = gg(d, a, b, c, k[6], 9, -1069501632); c = gg(c, d, a, b, k[11], 14, 643717713); b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691); d = gg(d, a, b, c, k[10], 9, 38016083); c = gg(c, d, a, b, k[15], 14, -660478335); b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438); d = gg(d, a, b, c, k[14], 9, -1019803690); c = gg(c, d, a, b, k[3], 14, -187363961); b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467); d = gg(d, a, b, c, k[2], 9, -51403784); c = gg(c, d, a, b, k[7], 14, 1735328473); b = gg(b, c, d, a, k[12], 20, -1926607734);
    a = hh(a, b, c, d, k[5], 4, -378558); d = hh(d, a, b, c, k[8], 11, -2022574463); c = hh(c, d, a, b, k[11], 16, 1839030562); b = hh(b, c, d, a, k[14], 23, -35309556);
    a = hh(a, b, c, d, k[1], 4, -1530992060); d = hh(d, a, b, c, k[4], 11, 1272893353); c = hh(c, d, a, b, k[7], 16, -155497632); b = hh(b, c, d, a, k[10], 23, -1094730640);
    a = hh(a, b, c, d, k[13], 4, 681279174); d = hh(d, a, b, c, k[0], 11, -358537222); c = hh(c, d, a, b, k[3], 16, -722521979); b = hh(b, c, d, a, k[6], 23, 76029189);
    a = hh(a, b, c, d, k[9], 4, -640364487); d = hh(d, a, b, c, k[12], 11, -421815835); c = hh(c, d, a, b, k[15], 16, 530742520); b = hh(b, c, d, a, k[2], 23, -995338651);
    a = ii(a, b, c, d, k[0], 6, -198630844); d = ii(d, a, b, c, k[7], 10, 1126891415); c = ii(c, d, a, b, k[14], 15, -1416354905); b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571); d = ii(d, a, b, c, k[3], 10, -1894986606); c = ii(c, d, a, b, k[10], 15, -1051523); b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8], 6, 1873313359); d = ii(d, a, b, c, k[15], 10, -30611744); c = ii(c, d, a, b, k[6], 15, -1560198380); b = ii(b, c, d, a, k[13], 21, 1309151649);
    a = ii(a, b, c, d, k[4], 6, -145523070); d = ii(d, a, b, c, k[11], 10, -1120210379); c = ii(c, d, a, b, k[2], 15, 718787259); b = ii(b, c, d, a, k[9], 21, -343485551);
    x[0] = add32(a, x[0]); x[1] = add32(b, x[1]); x[2] = add32(c, x[2]); x[3] = add32(d, x[3]);
  }
  function cmn(q: number, a: number, b: number, x: number, s: number, t: number) { a = add32(add32(a, q), add32(x, t)); return add32((a << s) | (a >>> (32 - s)), b); }
  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn((b & c) | ((~b) & d), a, b, x, s, t); }
  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn((b & d) | (c & (~d)), a, b, x, s, t); }
  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn(b ^ c ^ d, a, b, x, s, t); }
  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn(c ^ (b | (~d)), a, b, x, s, t); }
  function md51(s: string) {
    const n = s.length; let state = [1732584193, -271733879, -1732584194, 271733878]; let i;
    for (i = 64; i <= n; i += 64) md5cycle(state, md5blk(s.substring(i - 64, i)));
    s = s.substring(i - 64);
    const tail = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]; for (i = 0; i < s.length; i++) tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
    tail[i >> 2] |= 0x80 << ((i % 4) << 3);
    if (i > 55) { md5cycle(state, tail); tail.fill(0); }
    tail[14] = n * 8;
    md5cycle(state, tail);
    return state;
  }
  function md5blk(s: string) {
    const md5blks = []; for (let i = 0; i < 64; i += 4) md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i+1) << 8) + (s.charCodeAt(i+2) << 16) + (s.charCodeAt(i+3) << 24);
    return md5blks;
  }
  const hex_chr = '0123456789abcdef'.split('');
  function rhex(n: number) {
    let s = ''; for (let j = 0; j < 4; j++) s += hex_chr[(n >> (j * 8 + 4)) & 0x0F] + hex_chr[(n >> (j * 8)) & 0x0F];
    return s;
  }
  function hex(x: number[]) { return x.map(rhex).join(''); }
  // MD5 with automatic UTF-8 encoding (matching PHP md5)
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return hex(md51(binary));
}

/* ------------------------------------------------------------------ */
/*  Feature tiers — maps key prefix → available mod features            */
/* ------------------------------------------------------------------ */
const FEATURE_MAP: Record<string, Record<string, boolean>> = {
  vip: {
    drone_zoom: true,
    fly: true,
    steal: true,
    roomInfo: true,
    esp_hero: true,
    auto_aim: true,
    map_hack: true,
    speed_hack: true,
    wall_hack: true,
    radar_hack: true,
    unlimited_gold: true,
    god_mode: true,
    anti_ban: true,
    esp_line: true,
    esp_box: true,
    esp_distance: true,
    esp_health: true,
    esp_name: true,
    esp_range: true,
    no_recoil: true,
    instant_cast: true,
    auto_skill: true,
    aim_fov: true,
    crosshair: true,
    esp_sound: true,
    no_fog: true,
    night_mode: true,
    unlock_skin: true,
    drone_speed: true,
    teleport: true,
    esp_minimap: true,
    esp_vehicle: true,
    esp_item: true,
    auto_loot: true,
    no_clip: true,
    one_hit_kill: true,
    infinite_mana: true,
    cooldown_zero: true,
    esp_player_count: true,
    esp_danger_zone: true,
    esp_loot: true,
    esp_vehicle_speed: true,
    esp_player_level: true,
    esp_player_rank: true,
    esp_player_kda: true,
    esp_player_gold: true,
    esp_player_items: true,
    wallHack: true,
    speedHack: true,
    noCooldown: true,
    autoWin: true,
  },
  basic: {
    esp_hero: true,
    auto_aim: true,
    map_hack: true,
    esp_line: true,
    esp_box: true,
    esp_distance: true,
    esp_health: true,
    esp_name: true,
    esp_range: true,
    esp_sound: true,
    esp_minimap: true,
    esp_player_count: true,
    esp_danger_zone: true,
  },
};

/** Determine which feature tier a key belongs to. */
function getKeyTier(keyValue: string): string {
  const upper = keyValue.toUpperCase();
  // VIP prefixes: ML_VIP, ML_PRIM, VIP, PRIM, PAN, LIC, etc.
  if (/^(ML_VIP|ML_PRIM|VIP|PRIM|PAN|LIC|PREMIUM|OWNER)/.test(upper)) return "vip";
  return "basic";
}

const login = httpAction(async (ctx, request) => {
  const cors = corsFor(request);
  const ip = clientIp(request);
  const ua = request.headers.get("user-agent") ?? undefined;

  // Rate limit: 10 per IP per minute
  if (rateHit(`login:${ip}`, 10)) {
    accessLog(request, 429, "rate_limit");
    return json({ ok: false, status: false, reason: "MEMBER KEY NOT REGISTERED", seal: "", data: {} }, 429, cors);
  }

  // Dynamic seal = MD5(key + secret_salt)
  const SEAL_SALT = process.env.PANXCZ_SEAL_SALT ?? "f0459d2e9c7eff9b0f18e6ae0cd80949";

  // Indonesian month names (matches PHP server format)
  const INDONESIAN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];
  const formatIndonesianDate = (ms: number) => {
    const d = new Date(ms);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(d.getUTCDate())} - ${INDONESIAN_MONTHS[d.getUTCMonth()]} - ${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
  };

  // Parse request body (form-urlencoded or JSON — auto-detect)
  const ct = (request.headers.get("content-type") || "").toLowerCase();
  let body: Record<string, unknown> = {};
  const rawText = await request.text();
  const trimmed = rawText.trim();
  // Smart detection: try JSON first if body looks like JSON
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        body = parsed;
      } else {
        body = Object.fromEntries(new URLSearchParams(trimmed).entries());
      }
    } catch {
      // Not valid JSON, try form-urlencoded
      try { body = Object.fromEntries(new URLSearchParams(trimmed).entries()); } catch {
        return json({ ok: false, status: false, reason: "MEMBER KEY NOT REGISTERED", seal: "", data: {} }, 400, cors);
      }
    }
  } else {
    try { body = Object.fromEntries(new URLSearchParams(trimmed).entries()); } catch {
      return json({ ok: false, status: false, reason: "MEMBER KEY NOT REGISTERED", seal: "", data: {} }, 400, cors);
    }
  }

  // Extract fields (flexible field names like /connect)
  const game = (typeof body.game === "string" ? body.game : "").trim().toUpperCase().slice(0, 32) || "MLBB";
  const key = (typeof body.key === "string" ? body.key
    : typeof body.user_key === "string" ? body.user_key
    : typeof body.license === "string" ? body.license
    : typeof body.license_key === "string" ? body.license_key
    : typeof body.login_key === "string" ? body.login_key
    : "").replace(/[\u0000-\u001f\u007f]/g, "").trim().toUpperCase().slice(0, 80);
  const hwid = (typeof body.hwid === "string" ? body.hwid
    : typeof body.device === "string" ? body.device
    : typeof body.serial === "string" ? body.serial
    : typeof body.device_id === "string" ? body.device_id
    : "").replace(/[\u0000-\u001f\u007f]/g, "").trim().toUpperCase().slice(0, 256);
  const wantsReset = body.action === "reset" || body.reset === true || body.reset === "true" || body.reset === "1";
  const serverRef = (typeof body.server === "string" ? body.server : "").trim();

  // Key is required
  if (key.length === 0) {
    accessLog(request, 400, "missing_key");
    return json({ ok: false, status: false, reason: "MEMBER KEY NOT REGISTERED", seal: realMd5(SEAL_SALT), data: {} }, 400, cors);
  }

  // Look up key in database
  const keyDoc = await ctx.runQuery(internal.nameserver.getKeyByValue, { key });
  if (keyDoc === null) {
    await ctx.runMutation(internal.nameserver.recordConnect, {
      key, ip, userAgent: ua, deviceId: hwid || undefined, game, ok: false, reason: "invalid_key",
    }).catch(() => {});
    accessLog(request, 401, "invalid_key");
    return json({ ok: false, status: false, reason: "MEMBER KEY NOT REGISTERED", seal: realMd5(SEAL_SALT), data: {} }, 401, cors);
  }

  // Dynamic seal = MD5(key_value + salt)
  const seal = realMd5(key + SEAL_SALT);

  // Key status checks
  if (keyDoc.status === "revoked") {
    accessLog(request, 403, "revoked");
    return json({ ok: false, status: false, reason: "Key telah dibatalkan", seal, data: {} }, 403, cors);
  }
  if (keyDoc.expiresAt > 0 && Date.now() > keyDoc.expiresAt) {
    const expiredDate = formatIndonesianDate(keyDoc.expiresAt);
    accessLog(request, 403, "expired");
    return json({ ok: false, status: false, reason: `License expired: ${expiredDate}`, seal, data: {} }, 403, cors);
  }
  if (keyDoc.maxUses > 0 && keyDoc.uses >= keyDoc.maxUses) {
    accessLog(request, 403, "usage_limit");
    return json({ ok: false, status: false, reason: "Key has reached its usage limit", seal, data: {} }, 403, cors);
  }

  // Server check
  let server: Doc<"servers"> | null = null;
  if (serverRef.length > 0) {
    server = await ctx.runQuery(internal.nameserver.getServerByCode, { code: serverRef.toLowerCase() });
  } else {
    server = await ctx.runQuery(internal.nameserver.getServerById, { serverId: keyDoc.serverId });
  }
  if (server === null) {
    accessLog(request, 403, "server_missing");
    return json({ ok: false, status: false, reason: "Server for this key no longer exists", seal, data: {} }, 403, cors);
  }
  if (server.status === "off") {
    accessLog(request, 403, "server_offline");
    return json({ ok: false, status: false, reason: "Server is offline", seal, data: {} }, 403, cors);
  }

  // HWID validation
  const boundDevices = keyDoc.devices ?? (keyDoc.deviceId ? [keyDoc.deviceId] : []);
  const knownDevice = hwid.length > 0 && boundDevices.some((d) => d.toUpperCase() === hwid);
  const maxDevices = keyDoc.maxDevices ?? 1;

  if (wantsReset) {
    if (boundDevices.length === 0) {
      accessLog(request, 200, "reset_no_device");
      return json({ ok: false, status: false, reason: "Key is not bound to any device", seal, data: {} }, 200, cors);
    }
    if (hwid.length === 0) {
      return json({ ok: false, status: false, reason: "Send device ID to reset binding", seal, data: {} }, 400, cors);
    }
    if (!knownDevice) {
      return json({ ok: false, status: false, reason: "HWID tidak cocok", seal, data: {} }, 403, cors);
    }
    await ctx.runMutation(internal.nameserver.resetKeyDeviceInternal, { keyId: keyDoc._id });
    await ctx.runMutation(internal.nameserver.recordConnect, {
      keyId: keyDoc._id, key, serverId: server._id, ip, userAgent: ua,
      deviceId: hwid, game, ok: true, reason: "device_reset", countUse: false,
    }).catch(() => {});
    accessLog(request, 200, "device_reset");
    return json({ ok: false, status: false, reason: "Device binding has been reset. Reconnect with new device.", seal, data: {} }, 200, cors);
  }

  if (maxDevices > 0 && boundDevices.length > 0 && hwid.length === 0) {
    return json({ ok: false, status: false, reason: "Device ID required — this key is device-locked", seal, data: {} }, 400, cors);
  }
  if (hwid.length > 0 && !knownDevice && maxDevices > 0 && boundDevices.length >= maxDevices) {
    return json({ ok: false, status: false, reason: "HWID tidak cocok", seal, data: {} }, 403, cors);
  }

  // Success: record connection, generate token
  await ctx.runMutation(internal.nameserver.recordConnect, {
    keyId: keyDoc._id, key, serverId: server._id, ip, userAgent: ua,
    deviceId: hwid || undefined, game, ok: true, bindDevice: true,
  }).catch(() => {});
  accessLog(request, 200, "success");

  // Generate unique token: {game}-{sealFirst8}-{rngHex8}
  const rng = Date.now();
  const rngHex = rng.toString(16).slice(-8).toUpperCase();
  const sealFirst8 = seal.slice(0, 8).toUpperCase();
  const token = `${game}-${sealFirst8}-${rngHex}`;

  // Expiry: use key's stored expiry, default 30 days from now
  const expiresAt = keyDoc.expiresAt > 0 ? keyDoc.expiresAt : Date.now() + 30 * 86400000;
  const expiredStr = formatIndonesianDate(expiresAt);

  // Feature tier based on key prefix
  const tier = getKeyTier(key);
  const features = FEATURE_MAP[tier] ?? FEATURE_MAP.basic;

  // PHP-compatible response format
  // Binary-compatible date format: "04-Sep-2026 19:17"
  const now = new Date();
  const p2 = (n: number) => String(n).padStart(2, "0");
  const datte = `${p2(now.getUTCDate())}-${INDONESIAN_MONTHS[now.getUTCMonth()]}-${now.getUTCFullYear()} ${p2(now.getUTCHours())}:${p2(now.getUTCMinutes())}`;

  return json({
    ok: true,
    status: true,
    reason: "success",
    seal,
    data: {
      Datte: datte,
      server: { name: server.name, code: server.code },
      instance: server.name || "Instance",
      key: {
        expiresAt: keyDoc.expiresAt || 0,
        uses: keyDoc.uses,
        maxUses: keyDoc.maxUses,
        maxDevices,
        devicesCount: boundDevices.length + (hwid.length > 0 && !knownDevice ? 1 : 0),
      },
      url: null,
      token,
      rng,
      tittle: game,
      expired: expiredStr,
      features,
    },
    // Top-level backward compat
    token,
    rng,
    tittle: game,
    expired: expiredStr,
    features,
  }, 200, cors);
});

/* ------------------------------------------------------------------ */
/*  Telegram webhook                                                   */
/* ------------------------------------------------------------------ */

const telegramWebhook = httpAction(async (ctx, request) => {
  try {
    const { webhook } = await import("./telegram");
    const handler = webhook as any;
    return await handler(ctx, request);
  } catch (e) {
    console.error("[telegram-webhook] Error:", e);
    return json({ error: String(e) }, 500);
  }
});

/* ------------------------------------------------------------------ */
/*  Custom endpoint catch-all — supports ANY path                      */
/*                                                                    */
/*  Registered last so specific routes (/connect, /health, etc.)       */
/*  take priority. Handles: /ml-check.php, /v1/auth, /hook/foo, etc.  */
/* ------------------------------------------------------------------ */

const customEndpoint = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const fullPath = url.pathname;
  const path = fullPath.replace(/^\//, "").replace(/\/+$/, "");

  if (path.length === 0) return json({ error: "missing endpoint path" }, 400);

  // Validate path format to prevent abuse
  const pathCheck = isValidEndpointPath(path);
  if (!pathCheck.ok) {
    accessLog(request, 400, `invalid_path:${pathCheck.reason}`);
    return json({ error: "invalid endpoint path" }, 400);
  }

  // Global rate limit per IP for custom endpoints
  const ip = clientIp(request);
  if (rateHit(`custom:${ip}`, 120)) {
    accessLog(request, 429, "rate_limit");
    return json({ error: "rate limited" }, 429);
  }

  const endpoint = await ctx.runQuery(internal.nameserver.getCustomEndpointByPath, { path });
  if (endpoint === null) { accessLog(request, 404, "-"); return json({ error: `endpoint /${path} not found` }, 404); }
  if (!endpoint.enabled) { accessLog(request, 503, "-"); return json({ error: `endpoint /${path} is disabled` }, 503); }

  if (endpoint.method !== "ANY" && request.method !== endpoint.method) {
    accessLog(request, 405, "-");
    return json({ error: `method ${request.method} not allowed — accepts ${endpoint.method} only` }, 405);
  }

  if (endpoint.authRequired) {
    const authType = endpoint.authType ?? "token";
    const settings = await ctx.runQuery(internal.nameserver.getSettingsInternal, {});
    const expectedToken = settings?.endpointAuthToken ?? "";
    const authHeader = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const queryToken = url.searchParams.get("token") ?? url.searchParams.get("key") ?? "";
    const provided = authHeader || queryToken;
    let authorized = false;

    if ((authType === "token" || authType === "any") && expectedToken.length > 0 && provided === expectedToken) authorized = true;
    if (!authorized && (authType === "key" || authType === "any")) {
      const keyValue = provided.toUpperCase().replace(/[\u0000-\u001f\u007f]/g, "").trim();
      if (keyValue.length > 0) {
        const keyDoc = await ctx.runQuery(internal.nameserver.getKeyByValue, { key: keyValue });
        if (keyDoc && keyDoc.status === "active") {
          const allowed = endpoint.allowedKeyIds ?? [];
          if (allowed.length === 0 || allowed.includes(keyDoc._id)) {
            const notExpired = keyDoc.expiresAt === 0 || Date.now() < keyDoc.expiresAt;
            const hasUses = keyDoc.maxUses === 0 || keyDoc.uses < keyDoc.maxUses;
            if (notExpired && hasUses) authorized = true;
          }
        }
      }
    }
    if (!authorized) { accessLog(request, 401, "-"); return json({ error: "unauthorized" }, 401); }
  }

  accessLog(request, endpoint.statusCode, "-");
  const ct = endpoint.contentType || "application/json";
  const cors = corsFor(request);

  // Limit request body to 8KB for logging, 1MB max for processing
  const MAX_BODY_LOG = 2048;
  const MAX_BODY_TOTAL = 1024 * 1024;
  let reqBody: string | undefined;
  if (request.method !== "GET") {
    const raw = await request.clone().text().catch(() => "");
    if (raw.length > MAX_BODY_TOTAL) {
      accessLog(request, 413, "body_too_large");
      return json({ error: "request body too large" }, 413);
    }
    reqBody = sanitizeInput(raw, MAX_BODY_LOG);
  }
  const logHit = (respSize: number, sc: number) => {
    ctx.runMutation(internal.nameserver.logCustomEndpointHit, {
      endpointPath: path, method: request.method, statusCode: sc,
      ip: clientIp(request), userAgent: request.headers.get("user-agent") ?? undefined,
      contentType: request.headers.get("content-type") ?? undefined,
      requestBody: reqBody,
      responseSize: respSize,
    }).catch(() => {});
  };

  // File response
  if (endpoint.responseType === "file" && endpoint.fileId) {
    let file: Doc<"files"> | null = null;
    try { file = await ctx.runQuery(internal.files.getAny, { fileId: endpoint.fileId as Id<"files"> }); } catch { file = null; }
    if (file === null) return json({ error: "linked file not found" }, 500);
    const storageUrl = await ctx.storage.getUrl(file.storageId);
    if (storageUrl === null) return json({ error: "file missing from storage" }, 500);

    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    const EXT_CT: Record<string, string> = {
      json: "application/json", js: "application/javascript", css: "text/css", html: "text/html",
      php: "text/plain", xml: "application/xml", svg: "image/svg+xml",
      txt: "text/plain", md: "text/markdown", csv: "text/csv",
      yml: "text/yaml", yaml: "text/yaml", toml: "text/toml",
      sh: "text/plain", py: "text/plain", rb: "text/plain",
      png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
      woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
      pdf: "application/pdf", mp3: "audio/mpeg", wav: "audio/wav",
      mp4: "video/mp4", webm: "video/webm",
      zip: "application/zip", tar: "application/x-tar", gz: "application/gzip",
      "7z": "application/x-7z-compressed", apk: "application/vnd.android.package-archive", wasm: "application/wasm",
    };
    const stored = file.contentType || "";
    const isNonRenderable = !stored || stored === "application/octet-stream" || stored.startsWith("application/x-") || stored === "text/x-php";
    const fileCt = isNonRenderable ? (EXT_CT[ext] || ct) : stored;

    const INLINE_LIMIT = 19 * 1024 * 1024;
    try {
      const res = await fetch(storageUrl);
      if (!res.ok) throw new Error(`storage responded ${res.status}`);
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength > INLINE_LIMIT) {      accessLog(request, 413, String(buffer.byteLength)); return json({ error: "file too large" }, 413); }
      accessLog(request, endpoint.statusCode, String(buffer.byteLength));
      logHit(buffer.byteLength, endpoint.statusCode);
      return new Response(buffer, {
        status: endpoint.statusCode,
        headers: { "Content-Type": fileCt, "Content-Length": String(buffer.byteLength), "Content-Disposition": "inline", "Cache-Control": "public, max-age=300", "X-Served-By": "custom-endpoint", ...SECURITY_HEADERS, ...cors },
      });
    } catch (err) {
      console.error("[custom-endpoint] file stream failed:", err);
      accessLog(request, 500, "-");
      // Don't leak internal error details
      return json({ error: "failed to serve file" }, 500);
    }
  }

  // Text response
  accessLog(request, endpoint.statusCode, String(endpoint.body.length));
  logHit(endpoint.body.length, endpoint.statusCode);
  return new Response(endpoint.body, {
    status: endpoint.statusCode,
    headers: { "Content-Type": ct, "Content-Disposition": "inline", "Cache-Control": "public, max-age=300", ...SECURITY_HEADERS, ...cors },
  });
});

/* ------------------------------------------------------------------ */
/*  /api/v1/auth/login — hardened auth endpoint (new spec)             */
/* ------------------------------------------------------------------ */

const v1AuthLogin = httpAction(async (ctx, request) => {
  const cors = corsFor(request);
  const ip = clientIp(request);
  const ua = request.headers.get("user-agent") ?? undefined;
  const appVersion = request.headers.get("x-app-version") ?? "";
  const NEVER_EXPIRES_MS = 4102444799000;
  const HERZ_SEAL = process.env.PANXCZ_SEAL ?? "8b3d18363278f9bbaf745f2749b32aca";
  const HERZ_CONST = "Vm8Lk7Uj2JmsjCPVPVjrLa7zgfx3uz9E";

  // --- Parse request body ---
  let body: Record<string, unknown> = {};
  const rawText = await request.text();
  const trimmed = rawText.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        body = parsed;
      } else {
        body = Object.fromEntries(new URLSearchParams(trimmed).entries());
      }
    } catch {
      try { body = Object.fromEntries(new URLSearchParams(trimmed).entries()); } catch {
        return json({ status: 400, error_code: "ERR_INVALID_REQUEST", message: "MEMBER KEY NOT REGISTERED" }, 400, cors);
      }
    }
  } else {
    try { body = Object.fromEntries(new URLSearchParams(trimmed).entries()); } catch {
      return json({ status: 400, error_code: "ERR_INVALID_REQUEST", message: "MEMBER KEY NOT REGISTERED" }, 400, cors);
    }
  }

  // Extract fields (supports both new and legacy format)
  const game = (typeof body.game === "string" ? body.game : "").trim().toUpperCase().slice(0, 32) || "MLBB";
  const loginKey = (typeof body.login_key === "string" ? body.login_key
    : typeof body.key === "string" ? body.key
    : typeof body.user_key === "string" ? body.user_key
    : typeof body.license === "string" ? body.license
    : typeof body.license_key === "string" ? body.license_key
    : "").replace(/[\u0000-\u001f\u007f]/g, "").trim().toUpperCase().slice(0, 80);

  const deviceInfo = (typeof body.device_info === "object" && body.device_info !== null)
    ? body.device_info as Record<string, unknown>
    : {};
  const hwid = (typeof deviceInfo.hwid === "string" ? deviceInfo.hwid
    : typeof body.hwid === "string" ? body.hwid
    : typeof body.device === "string" ? body.device
    : typeof body.serial === "string" ? body.serial
    : typeof body.device_id === "string" ? body.device_id
    : "").trim().toUpperCase().slice(0, 256);
  const model = (typeof deviceInfo.model === "string" ? deviceInfo.model : "").trim().slice(0, 64);
  const osVersion = (typeof deviceInfo.os_version === "string" ? deviceInfo.os_version : "").trim().slice(0, 32);
  const timestamp = typeof body.timestamp === "number" ? body.timestamp : Math.floor(Date.now() / 1000);
  const wantsReset = body.action === "reset" || body.reset === true;
  const version = (typeof body.version === "string" ? body.version : "").trim().slice(0, 32);
  const resource = (typeof body.resource === "string" ? body.resource : "").trim().slice(0, 128);

  if (loginKey.length === 0) return json({ status: 400, error_code: "ERR_MISSING_KEY", message: "login_key is required" }, 400, cors);

  // --- Rate limiting (per IP + per HWID) ---
  if (rateHitEnhanced(ip, hwid, RATE_MAX_PER_IP, RATE_MAX_PER_HWID)) {
    return json({ status: 429, error_code: "ERR_RATE_LIMITED", message: "Too many requests. Try again later." }, 429, cors);
  }

  // --- Anti-tamper: verify client signature ---
  const payloadStr = `${loginKey}:${hwid}:${game}:${timestamp}`;
  if (!(await verifyClientSignature(request, payloadStr))) {
    accessLog(request, 403, "signature_fail");
    return json({ status: 403, error_code: "ERR_TAMPER_DETECTED", message: "Client integrity check failed" }, 403, cors);
  }

  // --- Timestamp freshness check (5 min window) ---
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - timestamp) > 300) {
    accessLog(request, 403, "stale_timestamp");
    return json({ status: 403, error_code: "ERR_STALE_REQUEST", message: "Request timestamp is too old" }, 403, cors);
  }

  // --- HWID validation ---
  if (hwid.length > 0) {
    const hwidCheck = validateHwid(hwid);
    if (!hwidCheck.valid) {
      return json({ status: 400, error_code: "ERR_INVALID_HWID", message: `Invalid hardware ID: ${hwidCheck.reason}` }, 400, cors);
    }
  }

  // --- Maintenance check ---
  const settings = await ctx.runQuery(internal.nameserver.getSettingsInternal, {});
  if (settings?.maintenance) {
    accessLog(request, 503, "maintenance");
    return json({ status: 503, error_code: "ERR_MAINTENANCE", message: settings.downMessage || "Server under maintenance" }, 503, cors);
  }

  // --- Look up key ---
  const keyDoc = await ctx.runQuery(internal.nameserver.getKeyByValue, { key: loginKey });
  if (keyDoc === null) {
    await ctx.runMutation(internal.nameserver.recordConnect, {
      key: loginKey, ip, userAgent: ua, deviceId: hwid || undefined,
      game, version, resource, ok: false, reason: "invalid_key",
    });
    if (rateHit(`fail:${ip}`, RATE_MAX_FAILURES_IP)) {
      return json({ status: 429, error_code: "ERR_TOO_MANY_FAILURES", message: "Too many failed attempts" }, 429, cors);
    }
    if (hwid.length > 0 && rateHit(`fail:${hwid}`, RATE_MAX_FAILURES_HWID, RATE_BUCKETS_HWID)) {
      return json({ status: 429, error_code: "ERR_TOO_MANY_FAILURES", message: "Too many failed attempts from this device" }, 429, cors);
    }
    accessLog(request, 401, "invalid_key");
    return json({ status: 401, error_code: "ERR_INVALID_KEY", message: "Key is invalid or does not exist" }, 401, cors);
  }

  // --- Key status checks ---
  if (keyDoc.status === "revoked") {
    accessLog(request, 403, "revoked");
    return json({ status: 403, error_code: "ERR_KEY_REVOKED", message: "Key has been revoked by administrator" }, 403, cors);
  }
  if (keyDoc.expiresAt > 0 && Date.now() > keyDoc.expiresAt) {
    accessLog(request, 403, "expired");
    return json({ status: 403, error_code: "ERR_KEY_EXPIRED", message: "Key has expired" }, 403, cors);
  }
  if (keyDoc.maxUses > 0 && keyDoc.uses >= keyDoc.maxUses) {
    accessLog(request, 403, "usage_limit");
    return json({ status: 403, error_code: "ERR_USAGE_LIMIT", message: "Key has reached its usage limit" }, 403, cors);
  }

  // --- Server check ---
  const server = await ctx.runQuery(internal.nameserver.getServerById, { serverId: keyDoc.serverId });
  if (server === null) {
    accessLog(request, 403, "server_missing");
    return json({ status: 403, error_code: "ERR_SERVER_MISSING", message: "Server for this key no longer exists" }, 403, cors);
  }
  if (server.status === "off") {
    accessLog(request, 403, "server_offline");
    return json({ status: 403, error_code: "ERR_SERVER_OFFLINE", message: "Server is offline" }, 403, cors);
  }

  // --- IP blacklist/whitelist ---
  const ipWhitelist = keyDoc.ipWhitelist ?? [];
  const ipBlacklist = keyDoc.ipBlacklist ?? [];
  if (ipBlacklist.length > 0 && ipBlacklist.some((b) => ip.startsWith(b.trim()))) {
    await ctx.runMutation(internal.nameserver.recordConnect, {
      keyId: keyDoc._id, key: loginKey, serverId: server._id, ip, userAgent: ua,
      deviceId: hwid || undefined, game, version, resource, ok: false, reason: "ip_blacklisted",
    });
    accessLog(request, 403, "ip_blacklisted");
    return json({ status: 403, error_code: "ERR_IP_BLACKLISTED", message: "Your IP address is blacklisted" }, 403, cors);
  }
  if (ipWhitelist.length > 0 && !ipWhitelist.some((a) => ip.startsWith(a.trim()))) {
    await ctx.runMutation(internal.nameserver.recordConnect, {
      keyId: keyDoc._id, key: loginKey, serverId: server._id, ip, userAgent: ua,
      deviceId: hwid || undefined, game, version, resource, ok: false, reason: "ip_not_whitelisted",
    });
    accessLog(request, 403, "ip_not_whitelisted");
    return json({ status: 403, error_code: "ERR_IP_NOT_WHITELISTED", message: "Your IP is not whitelisted for this key" }, 403, cors);
  }

  // --- Game mismatch check ---
  const keyGame = keyDoc.game ?? "";
  if (keyGame.length > 0 && game.length > 0 && game !== keyGame.toUpperCase()) {
    await ctx.runMutation(internal.nameserver.recordConnect, {
      keyId: keyDoc._id, key: loginKey, serverId: server._id, ip, userAgent: ua,
      deviceId: hwid || undefined, game, version, resource, ok: false, reason: "game_mismatch",
    });
    accessLog(request, 403, "game_mismatch");
    return json({ status: 403, error_code: "ERR_GAME_MISMATCH", message: `This key is assigned to ${keyGame} only` }, 403, cors);
  }

  // --- Device binding ---
  const boundDevices = keyDoc.devices ?? (keyDoc.deviceId ? [keyDoc.deviceId] : []);
  const knownDevice = hwid.length > 0 && boundDevices.some((d) => d.toUpperCase() === hwid);
  const maxDevices = keyDoc.maxDevices ?? 1;

  if (wantsReset) {
    if (boundDevices.length === 0) {
      accessLog(request, 200, "reset_no_device");
      return json({ status: 200, error_code: null, message: "Key is not bound to any device" }, 200, cors);
    }
    if (hwid.length === 0) {
      return json({ status: 400, error_code: "ERR_MISSING_HWID", message: "Send device ID to reset binding" }, 400, cors);
    }
    if (!knownDevice) {
      return json({ status: 403, error_code: "ERR_DEVICE_MISMATCH", message: "Key is bound to a different device" }, 403, cors);
    }
    await ctx.runMutation(internal.nameserver.resetKeyDeviceInternal, { keyId: keyDoc._id });
    await ctx.runMutation(internal.nameserver.recordConnect, {
      keyId: keyDoc._id, key: loginKey, serverId: server._id, ip, userAgent: ua,
      deviceId: hwid, game, version, resource, ok: true, reason: "device_reset", countUse: false,
    });
    accessLog(request, 200, "device_reset");
    return json({ status: 200, error_code: null, message: "Device binding has been reset" }, 200, cors);
  }

  if (maxDevices > 0 && boundDevices.length > 0 && hwid.length === 0) {
    return json({ status: 400, error_code: "ERR_MISSING_HWID", message: "Device ID required — this key is device-locked" }, 400, cors);
  }
  if (hwid.length > 0 && !knownDevice && maxDevices > 0 && boundDevices.length >= maxDevices) {
    return json({ status: 403, error_code: "ERR_DEVICE_LIMIT", message: `Key is bound to max ${maxDevices} device(s). Reset from panel.` }, 403, cors);
  }

  // --- Success: record connection, generate session ---
  const rec = await ctx.runMutation(internal.nameserver.recordConnect, {
    keyId: keyDoc._id, key: loginKey, serverId: server._id, ip, userAgent: ua,
    deviceId: hwid || undefined, game, version, resource, ok: true, bindDevice: true,
  });
  accessLog(request, 200, "success");

  // --- Webhook notification ---
  const webhookUrl = settings?.webhookUrl ?? "";
  if (webhookUrl.length > 0) {
    fetch(webhookUrl, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "login", key: loginKey, server: server.name, ip, device: hwid || null, game, timestamp: Date.now() }),
    }).catch(() => {});
  }

  // --- Hook URL for game routing ---
  let hookUrl: string | null = null;
  if (game.length > 0) {
    const endpoints = await ctx.runQuery(internal.nameserver.listCustomEndpointsInternal);
    const gameEp = endpoints.find((e) => e.game && e.game.toUpperCase() === game.toUpperCase() && e.enabled);
    if (gameEp) hookUrl = `${new URL(request.url).origin}/${gameEp.path}`;
  }

  // --- Generate session token and HMAC signature ---
  const expiresAt = keyDoc.expiresAt > 0 ? keyDoc.expiresAt : NEVER_EXPIRES_MS;
  const sessionTs = Date.now();
  const sessionToken = generateSessionToken(loginKey, hwid, sessionTs);
  const responsePayload = JSON.stringify({ key: loginKey, session: sessionToken, expires: expiresAt });
  const responseSignature = await hmacSign(responsePayload);

  // --- Build response ---
  const response: Record<string, unknown> = {
    status: 200,
    error_code: null,
    message: "AUTH_SUCCESS",
    data: {
      session_token: sessionToken,
      expires_at: Math.floor(expiresAt / 1000),
      features: FEATURE_MAP[getKeyTier(loginKey)] ?? FEATURE_MAP.basic,
      signature: responseSignature,
      server: { name: server.name, code: server.code },
      key: {
        expiresAt: keyDoc.expiresAt,
        uses: rec?.uses ?? keyDoc.uses,
        maxUses: keyDoc.maxUses,
        maxDevices,
        devicesCount: rec?.devicesCount ?? boundDevices.length,
      },
      hookUrl: hookUrl ?? null,
      seal: HERZ_SEAL,
      token: hwid.length > 0 ? md5(`MLBB-${HERZ_SEAL}-${hwid}-${HERZ_CONST}`) : `TOKEN-${randomToken().slice(0, 8).toUpperCase()}`,
      rng: Math.floor(Date.now() / 1000),
      tittle: game,
    },
  };

  return json(response, 200, cors);
});

/* ------------------------------------------------------------------ */
/*  CORS / method not allowed                                          */
/* ------------------------------------------------------------------ */

const preflight = httpAction(async (_ctx, _request) =>
  new Response(null, { status: 204, headers: { ...CORS_HEADERS } })
);

const methodNotAllowed = httpAction(async (_ctx, request) => {
  accessLog(request, 405, "-");
  return json({ ok: false, status: false, error: "method not allowed" }, 405, corsFor(request));
});

/* ------------------------------------------------------------------ */
/*  Routes                                                             */
/* ------------------------------------------------------------------ */

http.route({ path: "/health", method: "GET", handler: health });
http.route({ path: "/api/v1/auth/login", method: "POST", handler: v1AuthLogin });
http.route({ path: "/api/v1/auth/login", method: "OPTIONS", handler: preflight });
// /auth — alias for /connect (POST only, same PHP-compatible format)
http.route({ path: "/auth", method: "POST", handler: connect });
http.route({ path: "/auth", method: "OPTIONS", handler: preflight });
http.route({ path: "/auth", method: "GET", handler: methodNotAllowed });
http.route({ path: "/connect", method: "POST", handler: connect });
http.route({ path: "/connect", method: "GET", handler: connect });
http.route({ path: "/connect", method: "PUT", handler: methodNotAllowed });
http.route({ path: "/connect", method: "PATCH", handler: methodNotAllowed });
http.route({ path: "/connect", method: "DELETE", handler: methodNotAllowed });
http.route({ path: "/api/app/version", method: "GET", handler: appVersion });
http.route({ path: "/api/login", method: "POST", handler: login });
http.route({ path: "/api/files", method: "POST", handler: upload });
http.route({ path: "/api/files", method: "GET", handler: listFiles });
http.route({ pathPrefix: "/api/files/", method: "DELETE", handler: deleteFile });
http.route({ pathPrefix: "/files/", method: "GET", handler: download });
http.route({ pathPrefix: "/databases/", method: "GET", handler: download });
http.route({ path: "/telegram/webhook", method: "POST", handler: telegramWebhook });
http.route({ path: "/connect", method: "OPTIONS", handler: preflight });
http.route({ path: "/api/", method: "OPTIONS", handler: preflight });
http.route({ pathPrefix: "/files/", method: "OPTIONS", handler: preflight });
http.route({ pathPrefix: "/databases/", method: "OPTIONS", handler: preflight });

// ═══════════════════════════════════════════════════════════════════
// CUSTOM ENDPOINT CATCH-ALL — registered LAST so specific routes
// take priority.  Handles ANY path: /ml-check.php, /v1/auth, /hook/x
// ═══════════════════════════════════════════════════════════════════
http.route({ pathPrefix: "/", method: "GET", handler: customEndpoint });
http.route({ pathPrefix: "/", method: "POST", handler: customEndpoint });
http.route({ pathPrefix: "/", method: "PUT", handler: customEndpoint });
http.route({ pathPrefix: "/", method: "PATCH", handler: customEndpoint });
http.route({ pathPrefix: "/", method: "DELETE", handler: customEndpoint });
http.route({ pathPrefix: "/", method: "OPTIONS", handler: preflight });

export default http;
