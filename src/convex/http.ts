import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

/** Body/header payloads are truncated before storing to keep logs cheap. */
const MAX_LOG_BYTES = 100 * 1024;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, x-hook-token, x-vercel-protection-bypass",
};

/** Constant-time comparison to avoid leaking the token through timing. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function queryToRecord(params: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of params.entries()) out[key] = value;
  return out;
}

function headersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value.length > 500 ? value.slice(0, 500) : value;
  });
  return out;
}

function truncate(value: string): string {
  return value.length > MAX_LOG_BYTES
    ? value.slice(0, MAX_LOG_BYTES) + "\n… (truncated)"
    : value;
}

/**
 * Parse the request body into a serializable string. Supports JSON,
 * x-www-form-urlencoded and multipart/form-data; anything else is stored as
 * raw text. Never throws — unparseable bodies are captured as an error note
 * so the request still gets logged.
 */
async function parseBody(
  request: Request,
  contentType: string,
): Promise<{ body?: string; bodyType?: string }> {
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.clone().formData();
      const parts: Record<string, string> = {};
      form.forEach((value, key) => {
        if (typeof value === "string") {
          parts[key] = value.length > 1000 ? value.slice(0, 1000) : value;
        } else {
          parts[key] = `[file] ${value.name} (${value.size} bytes)`;
        }
      });
      return { body: truncate(JSON.stringify(parts, null, 2)), bodyType: "multipart" };
    }
    if (contentType.includes("application/json") || contentType.includes("+json")) {
      const raw = await request.clone().text();
      if (raw.trim().length === 0) return { bodyType: "none" };
      const parsed = JSON.parse(raw);
      return { body: truncate(JSON.stringify(parsed, null, 2)), bodyType: "json" };
    }
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const raw = await request.clone().text();
      if (raw.trim().length === 0) return { bodyType: "none" };
      const params = new URLSearchParams(raw);
      const parts: Record<string, string> = {};
      params.forEach((value, key) => {
        parts[key] = value.length > 1000 ? value.slice(0, 1000) : value;
      });
      return { body: truncate(JSON.stringify(parts, null, 2)), bodyType: "form" };
    }
    const raw = await request.clone().text();
    if (raw.trim().length === 0) return { bodyType: "none" };
    return { body: truncate(raw), bodyType: "text" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      body: truncate(`[could not parse body] ${message}`),
      bodyType: "error",
    };
  }
}

const hookEndpoint = httpAction(async (ctx, request) => {
  // CORS preflight so browser-based scripts can call the endpoint too.
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      undefined;

    const json = (payload: unknown, status: number) =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });

    // Resolve the hook path from the URL (/api/hook/<path>) or, as an
    // alternative, from a query parameter (?key=, ?path= or ?hook=).
    let rawPath = url.pathname.replace(/^\/api\/hook\/?/, "").split("/")[0].trim();
    if (rawPath.length === 0) {
      rawPath =
        url.searchParams.get("key") ||
        url.searchParams.get("path") ||
        url.searchParams.get("hook") ||
        "";
    }
    if (rawPath.length === 0) {
      return json(
        {
          error: "missing hook path",
          hint: "call /api/hook/<path> or pass ?key=<path>",
        },
        404,
      );
    }

    const hook = await ctx.runQuery(internal.hooks.getByPath, {
      path: rawPath,
    });
    if (hook === null) {
      return json({ error: "hook not found" }, 404);
    }

    const query = queryToRecord(url.searchParams);
    const headers = headersToRecord(request.headers);

    const log = async (
      status: number,
      authenticated: boolean,
      error: string | undefined,
      body?: string,
      bodyType?: string,
    ) => {
      try {
        await ctx.runMutation(internal.requests.insertLog, {
          hookId: hook._id,
          ownerId: hook.ownerId,
          method,
          url: url.toString(),
          headers,
          query,
          body,
          bodyType,
          ip,
          status,
          authenticated,
          error,
        });
      } catch (err) {
        console.error("failed to log webhook request:", err);
      }
    };

    if (!hook.enabled) {
      await log(403, false, "hook disabled");
      return json({ error: "hook disabled" }, 403);
    }

    if (hook.methods.length > 0 && !hook.methods.includes(method)) {
      await log(405, false, `method ${method} not allowed`);
      return json(
        { error: "method not allowed", allowed: hook.methods },
        405,
      );
    }

    let authenticated = true;
    let authError: string | undefined;
    if (hook.requireToken && hook.token) {
      const supplied =
        request.headers.get("x-hook-token") ||
        request.headers.get("x-vercel-protection-bypass") ||
        (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") ||
        url.searchParams.get("token") ||
        url.searchParams.get("bypass") ||
        "";
      if (!constantTimeEqual(supplied.trim(), hook.token)) {
        authenticated = false;
        authError = "invalid or missing token";
      }
    }

    const { body, bodyType } = await parseBody(request, headers["content-type"] ?? "");

    if (!authenticated) {
      await log(403, false, authError, body, bodyType);
      return json(
        {
          error: "unauthorized",
          hint: "pass the token via ?token=, ?bypass=, the x-hook-token header, the x-vercel-protection-bypass header, or Authorization: Bearer",
        },
        403,
      );
    }

    await log(hook.responseStatus, true, undefined, body, bodyType);

  return new Response(hook.responseBody, {
    status: hook.responseStatus,
    headers: {
      "Content-Type": hook.responseContentType || "application/json",
      ...CORS_HEADERS,
    },
  });
});

// Register the endpoint for the methods scripts actually use. Both the
// path-based form (/api/hook/<path>) and the query-based form (/api/hook?key=)
// are supported.
const ROUTED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;
for (const method of ROUTED_METHODS) {
  http.route({ pathPrefix: "/api/hook/", method, handler: hookEndpoint });
  http.route({ path: "/api/hook", method, handler: hookEndpoint });
}

export default http;
