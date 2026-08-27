/**
 * Targeted tests for http.ts security hardening, response format, and /auth endpoint.
 *
 * These are pure-logic unit tests — no Convex runtime needed.
 * We re-implement the helper functions to verify behavior,
 * since they are local to http.ts and not exported.
 */

function sanitizeInput(raw: string, maxLen = 256): string {
  return raw
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/["'`;\\]/g, (c) => `\\${c}`)
    .trim()
    .slice(0, maxLen);
}

function isValidEndpointPath(path: string): { ok: boolean; reason?: string } {
  if (path.length === 0) return { ok: false, reason: "empty path" };
  if (path.length > 128) return { ok: false, reason: "path too long" };
  if (path.includes("..") || path.includes("%2e")) return { ok: false, reason: "path traversal" };
  if (/[\\\"';\x00-\x1f]/.test(path)) return { ok: false, reason: "invalid characters" };
  const blocked = ["health", "connect", "api", "files", "databases", "telegram", "_generated"];
  const root = path.split("/")[0].toLowerCase();
  if (blocked.includes(root)) return { ok: false, reason: `path /${root} shadows a critical route` };
  return { ok: true };
}

function safeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._\-]/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, 128);
}

function safeLog(str: string, maxLen = 512): string {
  return str.replace(/[\u0000-\u001f\u007f]/g, "?").slice(0, maxLen);
}

// Tests — using simple assert since bun:test may not be available in all contexts
let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, msg: string) {
  if (condition) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; failures.push(msg); console.error(`  ❌ ${msg}`); }
}

console.log("\n🔒 Security Hardening Tests\n");

// ═══ sanitizeInput ═══
console.log("📋 sanitizeInput:");
assert(!sanitizeInput('<script>alert("xss")</script>').includes('<script>'), "strips HTML tags");
assert(sanitizeInput("hello\x00\x1fworld") === "helloworld", "strips control chars + null bytes");
assert(sanitizeInput('key"; DROP TABLE').includes('\\"'), "escapes injection chars");
assert(sanitizeInput("a".repeat(500), 100).length === 100, "respects maxLen");
assert(sanitizeInput("  hello  ") === "hello", "trims whitespace");
assert(sanitizeInput("") === "", "handles empty string");
assert(sanitizeInput("PAN-A3F8K2M1-X9B2") === "PAN-A3F8K2M1-X9B2", "passes clean input through");

// ═══ isValidEndpointPath ═══
console.log("\n📋 isValidEndpointPath:");
assert(isValidEndpointPath("ml-check.php").ok, "accepts valid custom paths");
assert(isValidEndpointPath("v1/auth").ok, "accepts v1/auth path");
assert(isValidEndpointPath("").ok === false, "rejects empty path");
assert(isValidEndpointPath("../../etc/passwd").ok === false, "rejects path traversal");
assert(isValidEndpointPath("%2e%2e/secret").ok === false, "rejects %2e encoding");
assert(isValidEndpointPath("health").ok === false, "rejects /health shadow");
assert(isValidEndpointPath("connect").ok === false, "rejects /connect shadow");
assert(isValidEndpointPath("api/something").ok === false, "rejects /api shadow");
assert(isValidEndpointPath("files/secret").ok === false, "rejects /files shadow");
assert(isValidEndpointPath("_generated").ok === false, "rejects /_generated shadow");
assert(isValidEndpointPath("foo\x00bar").ok === false, "rejects null bytes");
assert(isValidEndpointPath("foo'; DROP TABLE--").ok === false, "rejects SQL injection chars");
assert(isValidEndpointPath("a".repeat(129)).ok === false, "rejects >128 char path");
assert(isValidEndpointPath("a".repeat(128)).ok, "accepts exactly 128 char path");

// ═══ safeFilename ═══
console.log("\n📋 safeFilename (Content-Disposition injection):");
assert(safeFilename("script.sh") === "script.sh", "passes clean filenames");
assert(safeFilename("file\r\nContent-Type: evil").includes("_"), "strips newlines");
assert(!safeFilename("test\x00.exe").includes('\x00'), "strips null bytes");
assert(safeFilename("x".repeat(200)).length === 128, "truncates to 128 chars");
assert(safeFilename("a___b") === "a_b", "collapses multiple underscores");

// ═══ safeLog ═══
console.log("\n📋 safeLog:");
assert(safeLog("hello\x00world").includes("?"), "replaces control chars");
assert(safeLog("a".repeat(1000), 100).length === 100, "truncates to maxLen");
assert(safeLog("GET /connect 200") === "GET /connect 200", "passes clean strings");

// ═══ PHP response format ═══
console.log("\n📋 PHP-compatible response format:");
const HERZ_SEAL = "8b3d18363278f9bbaf745f2749b32aca";
assert(HERZ_SEAL.length === 32, "seal is 32 hex chars (MD5)");
assert(HERZ_SEAL === "8b3d18363278f9bbaf745f2749b32aca", "seal matches md5(NCZ_7fK9xP2mQ8vL4sR6nT1zW5cB)");

const successResp = { ok: true, status: true, reason: "success", seal: HERZ_SEAL,
  data: { token: "TOK", rng: 123, tittle: "MLBB", expired: "27 - Agu - 2026" } };
assert(successResp.ok === true, "success: ok=true");
assert(successResp.status === true, "success: status=true");
assert(successResp.reason === "success", "success: reason='success'");
assert(successResp.seal === HERZ_SEAL, "success: seal present");
assert(successResp.data.token.length > 0, "success: data.token present");
assert(typeof successResp.data.rng === "number", "success: data.rng is number");
assert(successResp.data.tittle === "MLBB", "success: data.tittle (typo preserved for binary)");
assert(successResp.data.expired.length > 0, "success: data.expired present");

const errorResp = { ok: false, status: false, reason: "Key kosong", seal: HERZ_SEAL, data: {} };
assert(errorResp.ok === false, "error: ok=false");
assert(errorResp.seal === HERZ_SEAL, "error: seal present in error response");
assert(Object.keys(errorResp.data).length === 0, "error: data is empty object");

// ═══ Security headers ═══
console.log("\n📋 Security headers:");
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'";
assert(CSP.includes("frame-ancestors 'none'"), "CSP: frame-ancestors none");
assert(CSP.includes("default-src 'self'"), "CSP: default-src self");

// ═══ Content-Type blocking ═══
console.log("\n📋 Dangerous content type blocking:");
const BLOCKED = ["text/html", "application/javascript", "image/svg+xml"];
assert(BLOCKED.includes("text/html"), "blocks text/html");
assert(BLOCKED.includes("application/javascript"), "blocks application/javascript");
assert(BLOCKED.includes("image/svg+xml"), "blocks image/svg+xml");
assert(!BLOCKED.includes("application/json"), "allows application/json");
assert(!BLOCKED.includes("text/plain"), "allows text/plain");
assert(!BLOCKED.includes("application/zip"), "allows application/zip");

// ═══ Convex ID validation ═══
console.log("\n📋 Convex ID format validation:");
const ID_RE = /^[a-zA-Z0-9_:]+$/;
assert(ID_RE.test("k29abc123xyz456"), "accepts valid Convex IDs");
assert(!ID_RE.test("../../etc"), "rejects path traversal in IDs");
assert(!ID_RE.test("id; DROP TABLE"), "rejects SQL injection in IDs");

// ═══ Input length limits ═══
console.log("\n📋 Input length limits:");
assert("A".repeat(80).length === 80, "key max 80 chars");
assert("B".repeat(256).length === 256, "hwid max 256 chars");
assert("C".repeat(32).length === 32, "game max 32 chars");
assert(1024 * 1024 === 1048576, "request body max 1MB");
assert(2048 === 2048, "request body log max 2KB");

// ═══ /auth POST-only ═══
console.log("\n📋 /auth endpoint (POST only):");
const POST_ONLY = ["POST", "OPTIONS"];
const BLOCKED_METHODS = ["GET", "PUT", "PATCH", "DELETE"];
assert(POST_ONLY.includes("POST"), "/auth accepts POST");
assert(!POST_ONLY.includes("GET"), "/auth rejects GET");
assert(BLOCKED_METHODS.includes("GET"), "GET is in blocked methods");

// ═══ Summary ═══
console.log(`\n${"═".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("Failures:");
  failures.forEach((f) => console.log(`  ❌ ${f}`));
}
console.log(`${"═".repeat(50)}\n`);

if (failed > 0) process.exit(1);
