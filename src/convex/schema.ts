import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.OWNER),
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
      balance: v.optional(v.number()), // wallet balance — generating keys deducts this
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // Every uploaded file. The bytes live in Convex object storage (S3-backed);
    // this table holds the metadata: display name, version, note, size,
    // SHA-256 checksum, content type, and download counter. Public download
    // URLs are served from convex/http.ts at GET /files/:id.
    files: defineTable({
      name: v.string(), // sanitized display name (original upload name)
      extension: v.string(), // ".apk", ".zip", … ("" when the name has none)
      version: v.optional(v.string()), // version label shown in the panel
      note: v.optional(v.string()), // free-text note
      size: v.number(), // bytes (verified when the checksum is computed)
      sha256: v.string(), // hex digest, "" until computeSha256 finishes
      contentType: v.string(), // mapped from the file extension
      storageId: v.id("_storage"), // the blob in Convex storage
      downloadCount: v.number(), // increments on every public download
      ownerId: v.optional(v.id("users")), // who uploaded it (informational)
      // Game this file is the loader/APK for (canonical: MLBB, FREEFIRE,
      // PUBG, …). /connect returns this file's URL for the matching game.
      game: v.optional(v.string()),
    }).index("by_game", ["game"]),

    // API access tokens for the REST API (POST /api/login or the panel's API
    // page). Only the sha256 hash is stored; the plaintext is shown once.
    apiTokens: defineTable({
      tokenHash: v.string(), // sha256 hex of the token — never the raw token
      label: v.string(), // e.g. "api-login" or a user-chosen name
      createdAt: v.number(),
      expiresAt: v.number(), // epoch ms
    }).index("by_hash", ["tokenHash"]),

    // Failed login attempts, used for per-IP rate limiting (5/min).
    loginAttempts: defineTable({
      ip: v.string(),
      time: v.number(), // epoch ms
    }).index("by_ip", ["ip", "time"]),

    // A "nameserver": a connect server the panel exposes. Clients (apps,
    // .sh scripts, .dll loaders…) connect to it by presenting a key at
    // POST /connect with the server's `code`.
    servers: defineTable({
      name: v.string(), // display name, e.g. "EU Main"
      code: v.string(), // unique lowercase slug used by clients: /connect?server=<code>
      description: v.optional(v.string()),
      status: v.union(v.literal("active"), v.literal("off")),
      createdBy: v.id("users"),
      customSeal: v.optional(v.string()), // custom MD5 seal for this server (e.g. from PHP file)
    }).index("by_code", ["code"]),

    // Generated connect keys. Generating one deducts `cost` from the
    // creator's balance (see users.balance). Clients present the raw key
    // to /connect; only the raw value is stored (hashed would prevent
    // copyback, and these are per-client tokens, not credentials).
    connectKeys: defineTable({
      key: v.string(), // the raw key, e.g. NS-XXXX-…
      serverId: v.id("servers"),
      createdBy: v.id("users"), // the admin/owner who generated it
      status: v.union(
        v.literal("active"),
        v.literal("used"), // reached maxUses
        v.literal("expired"),
        v.literal("revoked"),
      ),
      maxUses: v.number(), // 0 = unlimited
      uses: v.number(), // successful connects so far
      expiresAt: v.number(), // epoch ms; 0 = never expires
      cost: v.number(), // balance that was deducted
      note: v.optional(v.string()),
      // Primary bound device (devices[0]). Kept in sync with `devices`.
      deviceId: v.optional(v.string()),
      // Every device that has bound to this key (capped at MAX_STORED_DEVICES,
      // oldest dropped). `uses` counts unique devices ever (history).
      devices: v.optional(v.array(v.string())),
      // 0 = unlimited devices, N = max devices. Undefined is treated as 1
      // (1 key = 1 device — the safe default).
      maxDevices: v.optional(v.number()),
      // Per-key game assignment: if set, only this game is accepted on connect.
      game: v.optional(v.string()),
      // IP access control: whitelist = only these IPs allowed, blacklist = these blocked.
      // Empty array = no restriction.
      ipWhitelist: v.optional(v.array(v.string())),
      ipBlacklist: v.optional(v.array(v.string())),
    })
      .index("by_key", ["key"])
      .index("by_server", ["serverId"])
      .index("by_creator", ["createdBy"]),

    // Every /connect attempt (success or failure) — the request log.
    // serverId is optional: attempts with an unknown key and no server code
    // are still logged.
    connections: defineTable({
      keyId: v.optional(v.id("connectKeys")),
      key: v.string(),
      serverId: v.optional(v.id("servers")),
      ip: v.string(),
      userAgent: v.optional(v.string()),
      deviceId: v.optional(v.string()), // device id presented by the client
      ok: v.boolean(), // did the validation succeed?
      reason: v.optional(v.string()),
      // Optional client metadata (Havest-style form protocol):
      // game=MLBB&version=1.0&user_key=…&serial=…&resource=…
      game: v.optional(v.string()),
      version: v.optional(v.string()),
      resource: v.optional(v.string()),
    })
      .index("by_server", ["serverId"])
      .index("by_key", ["keyId"]),

    // Global owner settings (single doc, scope = "global").
    settings: defineTable({
      scope: v.string(),
      keyPrice: v.number(), // balance deducted per generated key
      defaultKeyUses: v.number(), // 0 = unlimited
      defaultKeyHours: v.number(), // 0 = never expires
      maintenance: v.boolean(), // blocks all /connect calls
      downMessage: v.optional(v.string()), // shown to clients during maintenance
      // Legacy prefix used when generating keys, e.g. "NS" → NS-XXXX-…
      // or "LIC" → LIC-XXXX-… (kept for compatibility).
      keyPrefix: v.optional(v.string()),
      // Key format template: X = random letter/number, # = random digit,
      // everything else literal. Examples: NS-XXXX-XXXX-XXXX-XXXX-XXXX,
      // ML_######### → ML_227182973, ML_XXXXXXXXXXXX. When unset, falls
      // back to the keyPrefix-based default above.
      keyFormat: v.optional(v.string()),
      telegramOwnerChatId: v.optional(v.string()), // bound Telegram chat (owner-level bot access)
      telegramBotUsername: v.optional(v.string()), // bot username cached from getMe
      // Bound Telegram chats for admin users: { chatId, userId } pairs.
      // Admins can run a subset of bot commands (check / reset their own
      // keys) from their bound chat.
      telegramAdmins: v.optional(
        v.array(v.object({ chatId: v.string(), userId: v.id("users") })),
      ),
      // Custom server domain — used in UI/Telegram to replace the long
      // Convex URL. E.g. "panxcz" → https://panxcz.site
      serverDomain: v.optional(v.string()),
      // Auth token for custom endpoints — clients must send this as a
      // Bearer token or query param ?token=… to access custom endpoints.
      endpointAuthToken: v.optional(v.string()),
      // Webhook URL: POST connect event data to this URL on every /connect.
      webhookUrl: v.optional(v.string()),
    }).index("by_scope", ["scope"]),

    // User-created custom HTTP endpoints. Each row becomes a live route
    // at GET/POST /hook/<path> that returns the configured response.
    customEndpoints: defineTable({
      path: v.string(), // URL path segment, e.g. "ml-check" → /hook/ml-check
      method: v.union(
        v.literal("GET"),
        v.literal("POST"),
        v.literal("PUT"),
        v.literal("PATCH"),
        v.literal("DELETE"),
        v.literal("ANY"),
      ),
      statusCode: v.number(), // HTTP status to return (100-599)
      body: v.string(), // response body (JSON string, plain text, etc.) — used when responseType="text"
      contentType: v.optional(v.string()), // Content-Type header override
      responseType: v.optional(v.union(v.literal("text"), v.literal("file"))), // "text" (default) serves body string, "file" serves uploaded file
      fileId: v.optional(v.id("files")), // when responseType="file", serve this uploaded file
      enabled: v.boolean(), // toggle without deleting
      authRequired: v.optional(v.boolean()), // require Bearer token
      authType: v.optional(v.union(v.literal("token"), v.literal("key"), v.literal("any"))), // "token" = Bearer token, "key" = connect key, "any" = either
      allowedKeyIds: v.optional(v.array(v.id("connectKeys"))), // when authType=key, only these keys allowed (empty = any valid key)
      game: v.optional(v.string()), // which game this endpoint is for (MLBB, FREEFIRE, etc.)
      createdBy: v.id("users"),
    })
      .index("by_path", ["path"]),

    // Request logs for custom endpoints — every hit to /hook/<path> is recorded here.
    customEndpointLogs: defineTable({
      endpointPath: v.string(), // which endpoint was hit
      method: v.string(), // HTTP method used
      statusCode: v.number(), // response status code sent
      ip: v.string(), // client IP
      userAgent: v.optional(v.string()),
      contentType: v.optional(v.string()), // request Content-Type (if any)
      requestBody: v.optional(v.string()), // truncated request body (first 2 KB)
      responseSize: v.number(), // response body size in bytes
      timestamp: v.number(), // Date.now()
    })
      .index("by_endpoint", ["endpointPath", "timestamp"])
      .index("by_time", ["timestamp"]),

  },
  {
    schemaValidation: false,
  },
);

export default schema;
