# nameserver — key-gated connect server

A nameserver panel: you create **servers**, generate **connect keys** (each one
costs **balance**), and your apps / `.sh` scripts / `.dll` loaders authenticate
through a single public endpoint:

```
POST /connect   { "license": "NS-XXXX-…", "device": "device-abc" }
```

**`/connect` is POST-only** (GET / PUT / PATCH / DELETE → `405`). Valid keys
get `{ ok: true, … }`; invalid, expired, revoked, or exhausted keys are
rejected with a reason — and **every attempt is logged** (server, key, device,
IP, user agent, result).

**License-key flow:** the client (app / `.sh` / `.dll`) just asks the user to
enter their license key. The `server` field is optional — it is detected from
the key automatically. `key` / `licenseKey` / `license_key` / `user_key` are
accepted as aliases for the license field; `device` / `hwid` / `serial` are
aliases for the device id. Keys and device ids are **case-insensitive**
(`ns-…` matches `NS-…`).

**Device binding:** each key binds to the devices that connect, gated by its
`maxDevices` setting:

- `maxDevices: 1` (default) → **1 key = 1 device**; a different device is
  rejected with `403 {"ok":false,"status":false,"error":"Device limit",…}`
- `maxDevices: N` → the key may bind up to N devices (mass-key / reseller
  mode)
- `maxDevices: 0` → unlimited devices
- `uses` counts **unique devices ever** — reconnects from a known device never
  burn quota, and a key that has reached `maxUses` via device binds is
  marked `used`.

**Response shape (works for every client):** every `/connect` response is a
superset that satisfies all three client families at once:

- native JSON clients check `ok: true` → `{"ok":true,"status":true,"message":"connected","expires":"2099-12-31 23:59:59","expiresAt":4102444799000,"expires_ts":4102444799,"data":{"server":{…},"key":{…},"url":…}}`
- Havest-style validators check `status: true` (a **boolean** everywhere —
  never a string)
- primebit-style loaders (FF_KERNEL / ML-KERNEL) search for the error strings
  `Invalid key` / `Key expired` / `Key banned` / `Device limit` /
  `Wrong Game Key` — no match = success — and parse `expires` for the expiry
  datetime.

Consistency rules: `status` is always `true`/`false`, every error carries the
same shape `{ok, status, error, message}`, and the three expiry fields
(`expires` string, `expiresAt` epoch ms, `expires_ts` epoch s) are all derived
from **one** source (`key.expiresAt`, epoch ms — forever keys report the
`2099-12-31 23:59:59` UTC sentinel instead of `0`, so no client ever reads
"expired in 1970").

**Reset a device binding** — when a key needs to move to a new machine:

- Panel: **Keys → reset icon** (shown on keys with a bound device). The owner,
  or the admin who generated the key, can unbind it any time.
- API (from the bound device, using the login key): send `action: "reset"`
  with the same `device` id — the device that owns the key unbinds itself:

  ```
  curl -X POST https://<deployment>.convex.site/connect \
    -H "Content-Type: application/json" \
    -d '{"key":"NS-…","device":"device-abc","action":"reset"}'
  # 200 → {"ok":true,"status":true,"action":"reset","message":"device unbound — the key can now connect from a new device"}
  ```

  The reset does not count as a key use, and the usage counter is untouched.

**Rate limiting & CORS:** `/connect` is protected against brute force —
5 failed attempts per IP per minute get `429` (total volume is also capped at
60 req/min/IP), and CORS is only granted to same-origin / localhost /
`.convex.site` / `.vercel.app` origins (native clients send no `Origin` header,
so curl / .sh / Android are unaffected).

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

# 200 → {"ok":true,"status":true,"message":"connected","expires":"2099-12-31 23:59:59","expiresAt":4102444799000,"expires_ts":4102444799,"data":{"server":{"name":"EU Main","code":"eu-main"},"key":{…},"url":…}}
# 400 → {"ok":false,"status":false,"error":"Invalid key","message":"missing key"}          (no key sent)
# 401 → {"ok":false,"status":false,"error":"Invalid key","message":"invalid key"}
# 403 → {"ok":false,"status":false,"error":"Key expired","message":"key has expired"}
#        (or revoked/offline → "Key banned" · wrong server → "Wrong Game Key" ·
#         bound to another device → "Device limit" · usage limit → "Key banned")
# 405 → {"ok":false,"status":false,"error":"Invalid key","message":"method not allowed — /connect accepts POST only"}
# 429 → {"ok":false,"status":false,"error":"Key banned","message":"too many attempts, try again later"}
# 503 → {"ok":false,"status":false,"error":"Key banned","message":"server under maintenance"}
# 404 → {"ok":false,"status":false,"error":"Invalid key","message":"server not found"}
```

### Havest-style form protocol

Clients that speak the original `connect.php` form protocol work unchanged —
just swap the URL. POST the same form fields to `/connect`:

```
POST /connect   (Content-Type: application/x-www-form-urlencoded)
game=MLBB&version=1.0&user_key=NS-…&serial=device-abc&resource=menu
```

- `user_key` → the license key · `serial` → device id (1 key = 1 device)
- `game` / `version` / `resource` are logged with the connect
- Responses match the original shape, so the validator's parser needs no
  changes: `{"status":true,"message":"…","data":{…}}` or
  `{"status":false,"message":"…"}`
- On success, `data.url` is the **APK response URL** — the newest loader/APK
  uploaded for that game (see Databases below):

  ```json
  {"status":true,"message":"connected","data":{"server":{…},"key":{…},"url":"https://…/databases/<id>"}}
  ```

### HERZ-style form protocol (herz_fix.sh, MIGORENG format)

Same form fields as Havest, but the binary validates the response shape field
by field. Form-encoded successes to `/connect` therefore also carry the
MIGORENG fields:

```
POST /connect   (Content-Type: application/x-www-form-urlencoded)
game=MLBB&user_key=NS-…&serial=<device-id>
```

- `user_key` → the license key · `serial` → device id (1 key = 1 device)
- Success (HTTP 200) is a superset that satisfies the binary's checks:

  ```json
  {"ok":true,"status":true,"reason":"success","seal":"96ce5f9743814c22352025eb8703fc39","data":{"token":"TOKEN-ABC123","rng":1755302400,"tittle":"MLBB","expired":"15 - Des - 2027 12:00:00","server":{…},"key":{…},"url":…}}
  ```

  - `data.rng` is the server unix timestamp (always `>= now - 30 s`)
  - `data.expired` is the key's expiry as an Indonesian date
    (`<dd> - <Mon> - <yyyy> <HH:mm:ss>`; forever keys report 2099)
  - `seal` is fixed at `96ce5f9743814c22352025eb8703fc39` — the binary
    compares it, so it must never change
- Failures stay non-200 with the usual error shape, so the binary's HTTP
  check (0xc8) rejects them.

### Primebit-style JSON protocol (FF_KERNEL / ML-KERNEL loaders)

Loaders that expect the `https://…/api/login` JSON protocol (Laravel-style
panels) work by **only swapping the URL** to `/connect` — request and
response parsing stay untouched:

```
POST /connect   (Content-Type: application/json)
{"key":"NS-…","hwid":"<android_id>+<ro.build.version.release>","game":"Free Fire"}
```

- `key` → the license key · `hwid` → device id (**1 key = 1 device** keeps
  working) · `game` → the loader's game (`Free Fire`/`FF` → FREEFIRE,
  `MLBB`/`ML` → MLBB, `PUBG` → PUBG) — logged and used for the APK response URL.
- Errors reply with the exact strings the loaders search for
  (`Invalid key`, `Key expired`, `Key banned`, `Device limit`, `Wrong Game
  Key`) in `error`/`message`:

  ```json
  {"ok":false,"status":false,"error":"Invalid key","message":"invalid key"}
  ```

- Success contains none of those substrings (so the loader treats it as a
  success) and includes `expires` for the expiry check:

  ```json
  {"ok":true,"status":true,"message":"connected","expires":"2099-12-31 23:59:59","expiresAt":4102444799000,"expires_ts":4102444799,"data":{"server":{…},"key":{"expiresAt":4102444799000,"uses":1,"maxUses":0,"maxDevices":1,"devicesCount":1},"url":"https://…/databases/<id>"}}
  ```

  `expires` is a `YYYY-MM-DD HH:MM:SS` (UTC) string derived from the single
  expiry source (`expiresAt`, epoch ms) — if your loader parses unix seconds
  instead, use `expires_ts`. Forever keys report the `2099-12-31 23:59:59`
  sentinel, never `0`.

## Databases (loaders / APK)

The panel has a **Databases** page (`/owner/databases` and `/admin/databases`)
where you upload the loader/APK files clients download after connecting — one
per game: **MLBB**, **Free Fire** and **PUBG**. Uploads go straight to Convex
object storage (no file size limit issues), SHA-256 is computed server-side,
and each file gets a public download URL:

```
GET /databases/<id>   →  the loader file (public, attachment download)
```

That URL is what `/connect` returns as `data.url` for the matching game, so
the tool can download its loader right after a successful connect. The URLs
are served from the Convex site, so they work from any frontend host —
**including Vercel** (no storage server needed; files never touch the Vercel
function filesystem).

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
| `/check <key>` | Key info — status, uses, device, id |
| `/resetkey <key>` | Unbind a key's device so it can connect from a new device (1 key = 1 device) |
| `/export` | JSON snapshot with ids — servers, keys, connections, members (chunked) |
| `/maintenance on\|off [message]` | Block / allow all `/connect` calls |
| `/tutorial` | Step-by-step guide: connect an app/script (.sh, .dll, …), generate keys, reset devices |
| `/id` | Show your chat id |

You can skip the panel step by setting `TELEGRAM_OWNER_CHAT_ID` as an
environment variable (it still requires `TELEGRAM_BOT_TOKEN`).

### Admin access (bind admin chats)

In the owner panel → **Telegram**, the **Admin access** card lets you bind an
admin's Telegram chat id (they send `/id` to the bot). Bound admins get a
limited command set from the bot — scoped to keys they generated:

| Command | Description |
| ------- | ----------- |
| `/keys` | Their last 5 generated keys |
| `/servers` | List servers with status |
| `/check <key>` | Key info — own keys only |
| `/resetkey <key>` | Unbind device — own keys only (admins reset keys from the bot without opening the panel) |
| `/tutorial` · `/id` | Guide · show chat id |

Everything else (`/stats`, `/balance`, `/genkey`, `/server`, `/maintenance`,
`/export`) stays owner-only. `/check` and `/resetkey` show the key's `_id` so
you can cross-reference it with the panel / `/export` output.

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
