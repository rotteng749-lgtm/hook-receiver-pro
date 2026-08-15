# nameserver — key-gated connect server

A nameserver panel: you create **servers**, generate **connect keys** (each one
costs **balance**), and your apps / `.sh` scripts / `.dll` loaders authenticate
through a single public endpoint:

```
POST /connect   { "key": "NS-XXXX-…", "server": "<code>" }
GET  /connect   ?key=NS-XXXX-…&server=<code>
```

Valid keys get `{ ok: true, … }`; invalid, expired, revoked, or exhausted keys
are rejected with a reason — and **every attempt is logged** (server, key, IP,
user agent, result).

## Roles

| Role    | Access                                                                 |
| ------- | ---------------------------------------------------------------------- |
| **owner** | Everything: all servers/keys/connections, member roles, balances, global settings. Panel at `/owner`. |
| **admin** | Creates & manages servers (theirs), generates keys. Each key deducts `keyPrice` from their balance. Panel at `/admin`. |
| **user**  | Account holder — sees their profile and balance. No key generation.     |
| client  | No panel — just calls `/connect` with a key + server code.              |

**Owner account:** the owner logs in with **username + password** (defaults
`Panxcz` / `Panxxcz`, overridable via the `ADMIN_USERNAME` / `ADMIN_PASSWORD`
environment variables). The account is created automatically the first time
the sign-in page loads — no email or sign-up needed. Admins and other members
are created by the owner in **Members → Add member** (username, password,
role, starting balance).

## Balance

- `users.balance` is the wallet. The owner sets balances (top-up/deduct) per
  member in **Members**.
- `generateKey` deducts `settings.keyPrice` from the generator's wallet; the
  key row records the cost.
- The owner controls `keyPrice`, default max-uses, default lifetime, and
  maintenance mode in **Settings** (owner panel).

## Quick start

1. **Sign in** at `/auth` with the owner username & password
   (`Panxcz` / `Panxxcz` by default) → you land on the owner panel `/owner`.
2. **Servers → New server** — name it, set a code (e.g. `eu-main`).
3. **Keys → Generate key** — pick the server, set uses/lifetime (or use the
   defaults), pay from balance, copy the key.
4. Client calls the connect URL with the key + server code.
5. **Members → Add member** — create admin accounts (username + password +
   starting balance) and hand them `/admin`.

```
curl -X POST https://<deployment>.convex.site/connect \
  -H "Content-Type: application/json" \
  -d '{"key":"NS-K4F2-X9LM-P7QW-3RTY-5VBN","server":"eu-main"}'

# 200 → {"ok":true,"server":{"name":"EU Main","code":"eu-main"},"key":{…},"message":"connected"}
# 401 → {"ok":false,"error":"invalid key"}
# 403 → {"ok":false,"error":"key has expired"}   (or revoked / usage limit / server offline)
# 503 → {"ok":false,"error":"server under maintenance"}
# 404 → {"ok":false,"error":"server not found"}
```

## Local development

```bash
bun install
bunx convex dev            # terminal 1 — runs the backend (starts codegen)
bun dev                    # terminal 2 — runs the panel UI
```

`VITE_CONVEX_URL` points the app at the Convex backend; the `/connect` endpoint
is served at the same URL (`.convex.site`).

## Environment variables

**Frontend (`.env.local` / Vercel):**

| Variable          | Required | Description |
| ----------------- | -------- | ----------- |
| `VITE_CONVEX_URL` | ✅       | Convex deployment URL (Convex dashboard → Settings) |

**Backend (Convex dashboard → Settings → Environment Variables):**

| Variable          | Default  | Description |
| ----------------- | -------- | ----------- |
| `ADMIN_USERNAME`  | `Panxcz` | Owner panel login **and** the legacy `POST /api/login` username |
| `ADMIN_PASSWORD`  | `Panxxcz`| Owner panel login **and** the legacy `POST /api/login` password |

Panel logins use Convex Auth with the username/password provider — no email
addresses are used anywhere.

## Deployment

### 1. Backend (Convex)

```bash
bunx convex deploy
```

Set `ADMIN_USERNAME` / `ADMIN_PASSWORD` in **Settings → Environment
Variables** if you want to override the legacy API login. The site URL
(`https://<deployment>.convex.site`) is where `/connect` lives.

### 2. Frontend (Vercel)

1. Push the repo to GitHub and import it in Vercel.
2. Framework preset: **Vite** · Build: `bun run build` · Output: `dist`.
3. Add `VITE_CONVEX_URL` = `https://<deployment>.convex.cloud`.
4. Deploy. The panel is at your Vercel URL; `/connect` is on the Convex site
   URL.

> No Vercel Protection Bypass header is needed: `/connect` runs on the Convex
> site (public by design) and the panel is protected by Convex Auth.

### 3. Smoke test

```bash
curl https://<deployment>.convex.site/health
# {"status":"ok"}
```

## REST API (legacy file server)

Kept from the earlier iteration — a small file server behind the same Convex
deployment (spec: file server v1). See `src/convex/http.ts`:

| Method | Path            | Auth         | Description |
| ------ | --------------- | ------------ | ----------- |
| POST   | `/api/login`    | public       | `{username, password}` → `{token, expiresAt}` (24 h) |
| POST   | `/api/files`    | Bearer token | multipart upload (`file`, `name`?, `version`?, `note`?) |
| GET    | `/api/files`    | Bearer token | list files with metadata |
| DELETE | `/api/files/:id`| Bearer token | delete file + bytes |
| GET    | `/files/:id`    | public       | download (stream ≤15 MB, else 302) |
| GET    | `/health`       | public       | `{"status":"ok"}` |

## API tokens & client libraries

The panel has an **API & Tokens** page (`/owner/api` and `/admin/api`) where
you can:

- **Create an API token** (Bearer) for the REST API — the plaintext is shown
  once, and tokens can be revoked any time.
- See the **base URL** (the Convex site URL, `…convex.site`) and the endpoint
  reference (`/connect`, `/api/login`, `/api/files`).
- Copy **ready-to-use client libraries** for **Next.js**, **Node.js**, **Python**
  and **Android Kotlin** — each shows `connect()` (public key validation),
  `apiLogin()` (username/password → 24 h token) and `listFiles()` (Bearer).

Example — validate a key from Python:

```python
import requests

r = requests.post("https://<deployment>.convex.site/connect",
                  json={"key": "NS-XXXX-…", "server": "eu-main"})
print(r.json())  # {"ok": true, "server": {…}, "key": {…}} or {"ok": false, "error": …}
```

## Project structure

- `src/convex/nameserver.ts` — servers, keys, balance, settings, connections,
  role checks, and the internal helpers used by `/connect`.
- `src/convex/http.ts` — public HTTP routes (`/connect`, `/health`, file API).
- `src/convex/schema.ts` — Convex schema (users + `servers`, `connectKeys`,
  `connections`, `settings`).
- `src/pages/owner/` — owner panel (overview, servers, keys, connections,
  members, settings).
- `src/pages/admin/` — admin panel (overview, servers, keys, connections).
- `src/pages/Servers.tsx` / `KeysPanel.tsx` / `Connections.tsx` — shared pages.
