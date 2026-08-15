# nameserver — key-gated connect server

A nameserver panel: you create **servers**, generate **connect keys** (each one
costs **balance**), and your apps / `.sh` scripts / `.dll` loaders authenticate
through a single public endpoint:

```
POST /connect   { "license": "NS-XXXX-…", "device": "device-abc" }
GET  /connect   ?license=NS-XXXX-…&device=device-abc
```

Valid keys get `{ ok: true, … }`; invalid, expired, revoked, or exhausted keys
are rejected with a reason — and **every attempt is logged** (server, key,
device, IP, user agent, result).

**License-key flow:** the client (app / `.sh` / `.dll`) just asks the user to
enter their license key. The `server` field is optional — it is detected from
the key automatically. `key` / `licenseKey` / `license_key` are accepted as
aliases for the license field.

**1 key = 1 device:** the optional `device` field binds a key to the first
device that connects. Once bound, a different device presenting the same key
is rejected with `403 {"ok":false,"error":"key is bound to another device"}`.

**Custom key format:** the owner sets the key prefix in **Settings** (e.g.
`NS` → `NS-XXXX-…`, or `LIC` → `LIC-XXXX-…`). Only A-Z / 0-9, up to 10 chars.

## Roles

| Role    | Access                                                                 |
| ------- | ---------------------------------------------------------------------- |
| **owner** | Everything: all servers/keys/connections, member roles, balances, global settings. **Unlimited wallet** — key generation never deducts. Panel at `/owner`. |
| **admin** | Creates & manages servers (theirs), generates keys. Each key deducts `keyPrice` from their balance. Panel at `/admin`. |
| **user**  | Account holder — sees their profile and balance. No key generation.     |
| client  | No panel — just calls `/connect` with a key + server code.              |

**Owner account:** the owner logs in with **username + password** (defaults
`Panxcz` / `Panxxcz`, overridable via the `ADMIN_USERNAME` / `ADMIN_PASSWORD`
environment variables). The account is created automatically the first time
the sign-in page loads — no email or sign-up needed.

**Adding owners & admins:** the owner can create more accounts in **Members →
Add member** (username, password, role, starting balance). Any account created
with role **owner** gets full owner access + unlimited wallet; **admin**
accounts get a starting balance to generate keys.

## Balance

- `users.balance` is the wallet. The owner sets balances (top-up/deduct) per
  member in **Members**.
- `generateKey` deducts `settings.keyPrice` from the generator's wallet; the
  key row records the cost. **The owner's wallet is unlimited** — the balance
  check and deduction are skipped for owner accounts (shown as `∞` in the panel).
- The owner controls `keyPrice`, default max-uses, default lifetime, and
  maintenance mode in **Settings** (owner panel).

## Quick start

1. **Sign in** at `/auth` with the owner username & password
   (`Panxcz` / `Panxxcz` by default) → you land on the owner panel `/owner`.
2. **Servers → New server** — name it, set a code (e.g. `eu-main`).
3. **Keys → Generate key** — pick the server, set uses/lifetime (or use the
   defaults), pay from balance, copy the key.
4. The client calls the connect URL with the license key the user entered.
5. **Members → Add member** — create admin accounts (username + password +
   starting balance) and hand them `/admin`.

```
curl -X POST https://<deployment>.convex.site/connect \
  -H "Content-Type: application/json" \
  -d '{"license":"NS-K4F2-X9LM-P7QW-3RTY-5VBN","device":"device-abc"}'

# 200 → {"ok":true,"server":{"name":"EU Main","code":"eu-main"},"key":{…},"message":"connected"}
# 401 → {"ok":false,"error":"invalid key"}
# 403 → {"ok":false,"error":"key has expired"}   (or revoked / usage limit / server offline / bound to another device)
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
| `TELEGRAM_BOT_TOKEN` | *(the project bot)* | Telegram bot token (owner-level bot control) |
| `TELEGRAM_OWNER_CHAT_ID` | — | Optional: pre-bind the owner Telegram chat (skip the panel step) |

Panel logins use Convex Auth with the username/password provider — no email
addresses are used anywhere.

## Telegram bot (owner level)

Open **Settings → Telegram** in the owner panel (`/owner/telegram`) to connect
the bot:

1. **Check bot** → the bot username appears → **Open in Telegram**.
2. Send `/id` to the bot and copy the number it replies with.
3. Paste the chat id in the panel and press **Bind as owner** — the webhook
   is registered at `/telegram/webhook` automatically.

Only the bound chat can talk to the bot, and every command runs with owner
permissions:

| Command | Description |
| ------- | ----------- |
| `/stats` | Panel overview (servers, keys, connects, revenue) |
| `/balance` | Your balance and the key price |
| `/servers` | List servers with status |
| `/keys` | Last 5 generated keys |
| `/server <code>` | Server detail + recent connect results |
| `/genkey <code> [uses] [hours]` | Generate a key (deducted from your balance) |
| `/maintenance on\|off [message]` | Block / allow all `/connect` calls |
| `/id` | Show your chat id |

You can skip the panel step by setting `TELEGRAM_OWNER_CHAT_ID` as an
environment variable (it still requires `TELEGRAM_BOT_TOKEN`).

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
