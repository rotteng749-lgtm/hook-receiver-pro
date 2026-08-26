/**
 * Simplified /connect handler.
 *
 * Validates a license key and returns the appropriate hook URL for the
 * requested game.  The actual license response (token, seal, expiry, etc.)
 * is served by custom endpoints — the admin configures those via the panel.
 *
 * Flow:
 *   1. Client calls  GET/POST /connect?key=NS-XXX&device=abc&game=MLBB
 *   2. Server validates the key, binds the device
 *   3. Returns { ok, hookUrl, server, key, expires }
 *   4. Client then calls the hookUrl to get the game-specific response
 *
 * The response shape is compatible with HERZ, Havest, primebit, and native
 * JSON clients so existing binaries keep working.
 */
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

  const normalizeKey = (raw: string) =>
    raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().toUpperCase().slice(0, 80);
  const normalizeDevice = (raw: string) =>
    raw.trim().toUpperCase().slice(0, 128);

  const contentType = (request.headers.get("content-type") || "").toLowerCase();
  const isForm = contentType.includes("application/x-www-form-urlencoded");

  if (request.method === "GET") {
    const qp = url.searchParams;
    key = normalizeKey(
      qp.get("license") ?? qp.get("key") ?? qp.get("user_key") ?? qp.get("license_key") ?? "",
    );
    serverRef = (qp.get("server") ?? "").trim();
    rawSerial = (qp.get("device") ?? qp.get("hwid") ?? qp.get("serial") ?? "").trim();
    device = normalizeDevice(rawSerial);
    wantsReset = qp.get("action") === "reset" || qp.get("reset") === "true" || qp.get("reset") === "1";
    game = (qp.get("game") ?? "").trim().slice(0, 32);
    version = (qp.get("version") ?? "").trim().slice(0, 32);
    resource = (qp.get("resource") ?? "").trim().slice(0, 128);
  } else if (isForm) {
    const params = new URLSearchParams(await request.text());
    key = normalizeKey(
      params.get("user_key") ?? params.get("key") ?? params.get("license") ?? "",
    );
    serverRef = (params.get("server") ?? "").trim();
    rawSerial = (params.get("serial") ?? params.get("hwid") ?? params.get("device") ?? "").trim();
    device = normalizeDevice(rawSerial);
    wantsReset = params.get("action") === "reset" || params.get("reset") === "true" || params.get("reset") === "1";
    game = (params.get("game") ?? "").trim().slice(0, 32);
    version = (params.get("version") ?? "").trim().slice(0, 32);
    resource = (params.get("resource") ?? "").trim().slice(0, 128);
  } else {
    let body: unknown;
    try {
      body = JSON.parse(await request.text());
    } catch {
      return json({ ok: false, status: false, error: "Invalid key", message: "expected a JSON body with a key" }, 400, corsFor(request));
    }
    const obj = body as Record<string, unknown>;
    key = normalizeKey(
      typeof obj.key === "string" ? obj.key
        : typeof obj.license === "string" ? obj.license
          : typeof obj.licenseKey === "string" ? obj.licenseKey
            : typeof obj.license_key === "string" ? obj.license_key
              : typeof obj.user_key === "string" ? obj.user_key : "",
    );
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
  const NEVER_EXPIRES_MS = 4102444799000; // 2099-12-31 23:59:59 UTC
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

  // Unified response formatter — satisfies every client family.
  const send = (body: Record<string, unknown>, status = 200) => {
    if (body.ok === true) {
      const serverInfo = body.server as Record<string, unknown> | undefined;
      const keyInfo = body.key as Record<string, unknown> | undefined;
      const hookUrl = typeof body.hookUrl === "string" ? body.hookUrl : undefined;
      const expiresAt = keyInfo !== undefined && typeof keyInfo.expiresAt === "number" && keyInfo.expiresAt > 0
        ? keyInfo.expiresAt : NEVER_EXPIRES_MS;
      const out: Record<string, unknown> = {
        ok: true,
        status: true,
        message: body.message ?? "success",
        expires: formatDate(expiresAt),
        expiresAt,
        expires_ts: Math.floor(expiresAt / 1000),
      };
      if (serverInfo !== undefined) {
        out.data = { server: serverInfo, key: keyInfo, hookUrl: hookUrl ?? null };
      }
      // HERZ / Havest form clients: add extra fields they validate
      if (isForm) {
        out.reason = "success";
        out.seal = HERZ_SEAL;
        const data = (out.data ?? {}) as Record<string, unknown>;
        data.token = rawSerial.length > 0
          ? md5(`MLBB-${HERZ_SEAL}-${rawSerial}-${HERZ_CONST}`)
          : `TOKEN-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
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

  if (rateHit(`ip:${ip}`, RATE_MAX_TOTAL)) {
    return send({ ok: false, error: "Invalid key", message: "too many requests" }, 429);
  }

  // Resolve server (optional — inferred from key if not provided)
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
    if (rateHit(`fail:${ip}`, RATE_MAX_FAILURES)) {
      return send({ ok: false, error: "Key banned", message: "too many attempts, try again later" }, 429);
    }
    return send({ ok: false, error: "Key banned", message }, status);
  };

  if (keyDoc === null) return await fail(401, "invalid_key", "invalid key");
  if (serverRef.length > 0 && keyDoc.serverId !== server!._id) {
    return await fail(401, "wrong_server", "key does not belong to this server");
  }
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

  // Reset device binding
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
    return send({ ok: true, action: "reset", message: "device unbound — the key can now connect from a new device" });
  }

  // IP whitelist/blacklist
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

  // Per-key game filtering
  const keyGame = keyDoc.game ?? "";
  if (keyGame.length > 0 && game.length > 0 && game.toUpperCase() !== keyGame.toUpperCase()) {
    await ctx.runMutation(internal.nameserver.recordConnect, { keyId: keyDoc._id, key, serverId: server._id, ip, userAgent: ua, deviceId: device, game, version, resource, ok: false, reason: "game_mismatch" });
    return await fail(403, "game_mismatch", `this key is assigned to ${keyGame} only`);
  }

  // Device gate
  if (maxDevices > 0 && boundDevices.length > 0 && device.length === 0) {
    return await fail(400, "missing_device", "missing device — this key is bound to a device");
  }
  if (device.length > 0 && !knownDevice && maxDevices > 0 && boundDevices.length >= maxDevices) {
    return await fail(403, "device_limit", "key has reached its device limit");
  }

  // Record successful connect
  const rec = await ctx.runMutation(internal.nameserver.recordConnect, {
    keyId: keyDoc._id, key, serverId: server._id, ip, userAgent: ua,
    deviceId: device || undefined, game, version, resource, ok: true, bindDevice: true,
  });
  accessLog(request, 200, "-");

  // Webhook notification
  const webhookUrl = settings?.webhookUrl ?? "";
  if (webhookUrl.length > 0) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "connect", key, server: server.name, ip, device: device || null, game: game || null, timestamp: Date.now() }),
      });
    } catch { /* non-blocking */ }
  }

  // ────────────────────────────────────────────────────────────────────
  // GAME ROUTING: find a custom endpoint tagged with this game and
  // return its URL so the client knows where to get the actual response.
  // ────────────────────────────────────────────────────────────────────
  let hookUrl: string | null = null;
  if (game.length > 0) {
    const endpoints = await ctx.runQuery(internal.nameserver.listCustomEndpointsInternal);
    const gameEp = endpoints.find(
      (e) => e.game && e.game.toUpperCase() === game.toUpperCase() && e.enabled,
    );
    if (gameEp) {
      hookUrl = `${new URL(request.url).origin}/hook/${gameEp.path}`;
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
    hookUrl,
    message: "connected",
  });
});
