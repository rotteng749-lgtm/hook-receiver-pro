import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
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

  },
  {
    schemaValidation: false,
  },
);

export default schema;
