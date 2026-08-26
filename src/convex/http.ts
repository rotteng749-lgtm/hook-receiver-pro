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

/* --- Rate limiting --- */
const RATE_BUCKETS = new Map<string, { count: number; ts: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_TOTAL = 60;
const RATE_MAX_FAILURES = 8;

function rateHit(key: string, max: number): boolean {
  const now = Date.now();
  const bucket = RATE_BUCKETS.get(key);
  if (!bucket || now - bucket.ts > RATE_WINDOW_MS) {
    RATE_BUCKETS.set(key, { count: 1, ts: now });
    return false;
  }
  bucket.count++;
  return bucket.count > max;
}

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

function normalizeGame(raw: string): string {
  return raw.trim().toUpperCase().slice(0, 32);
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
    const params = new URLSearchParams(await request.text());
    key = normalizeKey(params.get("user_key") ?? params.get("key") ?? params.get("license") ?? "");
    serverRef = (params.get("server") ?? "").trim();
    rawSerial = (params.get("serial") ?? params.get("hwid") ?? params.get("device") ?? "").trim();
    device = normalizeDevice(rawSerial);
    wantsReset = params.get("action") === "reset" || params.get("reset") === "true" || params.get("reset") === "1";
    game = (params.get("game") ?? "").trim().slice(0, 32);
    version = (params.get("version") ?? "").trim().slice(0, 32);
    resource = (params.get("resource") ?? "").trim().slice(0, 128);
  } else {
    let body: unknown;
    try { body = JSON.parse(await request.text()); } catch {
      return json({ ok: false, status: false, error: "Invalid key", message: "expected a JSON body" }, 400, corsFor(request));
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
  const HERZ_SEAL = "96ce5f9743814c22352025eb8703fc39";
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
      const out: Record<string, unknown> = { ok: true, status: true, message: body.message ?? "success", expires: formatDate(expiresAt), expiresAt, expires_ts: Math.floor(expiresAt / 1000) };
      if (serverInfo !== undefined) out.data = { server: serverInfo, key: keyInfo, hookUrl: hookUrl ?? null };
      if (isForm) {
        out.reason = "success";
        out.seal = HERZ_SEAL;
        const data = (out.data ?? {}) as Record<string, unknown>;
        data.token = rawSerial.length > 0 ? md5(`MLBB-${HERZ_SEAL}-${rawSerial}-${HERZ_CONST}`) : `TOKEN-${randomToken().slice(0, 8).toUpperCase()}`;
        data.rng = Math.floor(Date.now() / 1000);
        data.tittle = game.length > 0 ? game : "MLBB";
        data.expired = formatIndonesianDate(expiresAt);
        out.data = data;
      }
      if (typeof body.action === "string") out.action = body.action;
      return json(out, status, cors);
    }
    const error = typeof body.error === "string" && body.error.length > 0 ? body.error : "Invalid key";
    return json({ ok: false, status: false, error, message: typeof body.message === "string" && body.message.length > 0 ? body.message : error }, status, cors);
  };

  if (key.length === 0) return send({ ok: false, error: "Invalid key", message: "missing key" }, 400);
  if (rateHit(`ip:${ip}`, RATE_MAX_TOTAL)) return send({ ok: false, error: "Invalid key", message: "too many requests" }, 429);

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
    if (rateHit(`fail:${ip}`, RATE_MAX_FAILURES)) return send({ ok: false, error: "Key banned", message: "too many attempts" }, 429);
    return send({ ok: false, error: "Key banned", message }, status);
  };

  if (keyDoc === null) return await fail(401, "invalid_key", "invalid key");
  if (serverRef.length > 0 && keyDoc.serverId !== server!._id) return await fail(401, "wrong_server", "key does not belong to this server");
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

  return send({
    ok: true,
    server: { name: server.name, code: server.code },
    key: { expiresAt: keyDoc.expiresAt, uses: rec?.uses ?? keyDoc.uses, maxUses: keyDoc.maxUses, maxDevices, devicesCount: rec?.devicesCount ?? boundDevices.length },
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
  const body = await request.json();
  const storageId = body.storageId as Id<"_storage">;
  const name = (body.name as string) ?? "unnamed";
  const size = (body.size as number) ?? 0;
  const ct = (body.contentType as string) ?? "application/octet-stream";
  const game = (body.game as string) ?? undefined;
  const version = (body.version as string) ?? undefined;
  const note = (body.note as string) ?? undefined;
  const fileId = await ctx.runMutation(internal.files.insertFile, { storageId, name, size, contentType: ct, sha256: "", note });
  return json({ ok: true, fileId });
});

const listFiles = httpAction(async (ctx, _request) => {
  const files = await ctx.runQuery(internal.files.listAll, {});
  return json(files);
});

const deleteFile = httpAction(async (ctx, request) => {
  const id = request.url.split("/").pop();
  if (!id) return json({ error: "missing file id" }, 400);
  try {
    await ctx.runMutation(internal.files.deleteFileById, { fileId: id as Id<"files"> });
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

const download = httpAction(async (ctx, request) => {
  const parts = request.url.split("/");
  const id = parts[parts.length - 1].split("?")[0] as Id<"files">;
  if (!id) return json({ error: "missing id" }, 400);
  const file = await ctx.runQuery(internal.files.getAny, { fileId: id });
  if (!file) return json({ error: "not found" }, 404);
  const url = await ctx.storage.getUrl(file.storageId);
  if (!url) return json({ error: "storage error" }, 500);
  await ctx.runMutation(internal.files.incrementDownload, { fileId: id });
  const res = await fetch(url);
  const blob = await res.arrayBuffer();
  return new Response(blob, {
    headers: { "Content-Type": file.contentType, "Content-Disposition": `inline; filename="${file.name}"`, "Content-Length": String(blob.byteLength), ...SECURITY_HEADERS, ...corsFor(request) },
  });
});

/* ------------------------------------------------------------------ */
/*  API login                                                          */
/* ------------------------------------------------------------------ */

const login = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  if (!token) return json({ error: "missing token" }, 400);
  const hash = await hashToken(token);
  const doc = await ctx.runQuery(internal.files.getTokenByHash, { tokenHash: hash });
  if (!doc) return json({ error: "invalid token" }, 401);
  return json({ ok: true, expiresAt: doc.expiresAt });
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

  const reqBody = request.method !== "GET" ? (await request.clone().text().catch(() => "")).slice(0, 2048) : undefined;
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
      return json({ error: "failed to serve file", detail: String(err) }, 500);
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
