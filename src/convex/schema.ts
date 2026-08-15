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

    // Webhook endpoints the user creates. Each one exposes a public URL at
    // /api/hook/<path> (served by the HTTP action in convex/http.ts) and
    // returns a configurable response. All incoming requests are logged.
    hooks: defineTable({
      name: v.string(), // display name
      path: v.string(), // custom URL segment, unique across all hooks
      methods: v.array(v.string()), // allowed methods, e.g. ["GET", "POST"]
      token: v.string(), // secret token used to validate incoming requests
      requireToken: v.boolean(), // whether the token must be supplied
      enabled: v.boolean(), // disabled hooks answer 403
      responseStatus: v.number(), // status code returned to the caller
      responseContentType: v.string(), // Content-Type of the response
      responseBody: v.string(), // literal response body returned to the caller
      ownerId: v.id("users"), // which user created this hook
    })
      .index("by_path", ["path"])
      .index("by_owner", ["ownerId"]),

    // Every request that hits a hook endpoint, captured for the admin panel.
    requests: defineTable({
      hookId: v.id("hooks"),
      ownerId: v.id("users"),
      method: v.string(),
      url: v.string(), // full request URL
      headers: v.optional(v.record(v.string(), v.string())),
      query: v.optional(v.record(v.string(), v.string())),
      body: v.optional(v.string()), // parsed/serialized body, truncated
      bodyType: v.optional(v.string()), // json | form | multipart | text | none | error
      ip: v.optional(v.string()),
      status: v.number(), // status code we answered with
      authenticated: v.boolean(), // token check passed (or not required)
      error: v.optional(v.string()), // rejection reason, e.g. "invalid token"
    })
      .index("by_hook", ["hookId"])
      .index("by_owner", ["ownerId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
