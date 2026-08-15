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
    }),

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
      // Device this key is bound to (1 key = 1 device). Bound on the first
      // successful /connect; unset means not bound yet. Empty string is the
      // placeholder when the client didn't send a device id.
      deviceId: v.optional(v.string()),
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
      // Prefix used when generating keys, e.g. "NS" → NS-XXXX-… or "LIC" → LIC-XXXX-…
      keyPrefix: v.optional(v.string()),
      telegramOwnerChatId: v.optional(v.string()), // bound Telegram chat (owner-level bot access)
      telegramBotUsername: v.optional(v.string()), // bot username cached from getMe
    }).index("by_scope", ["scope"]),

  },
  {
    schemaValidation: false,
  },
);

export default schema;
