# Stash — internal file server

A file server / download server that uploads, stores, and distributes files of
any type (`.apk`, `.sh`, `.dll`, `.so`, `.zip`, `.txt`, …) with:

- **Admin panel** — upload & manage files (sign-in required), each file gets a
  public download link, a QR code, and full metadata (name, version, size,
  SHA-256, created date, download count).
- **Public downloads** — `GET /files/:id` needs no auth. Small files stream
  with `Content-Disposition: attachment` and `X-Checksum-Sha256`; larger files
  redirect (302) to a signed storage URL.
- **REST API** — `login` → Bearer token → `upload / list / delete` for scripts
  and CI, plus a public `/health`.
- **Admin auth** — panel sign-in (email OTP, or one-click guest/demo mode),
  plus username/password login for the API with a rate-limited (5/min/IP)
  token issuance.

**Spec:** "File server / download server v1" · **Date:** 2026-08-15

---

## Architecture (spec section 4 & 8)

This implementation follows the **"Vercel + object storage"** architecture from
the spec — there is no persistent filesystem anywhere:

| Spec requirement            | Here                          |
| --------------------------- | ----------------------------- |
| Serverless HTTP functions   | Convex HTTP actions           |
| Object storage for bytes    | Convex file storage (S3-backed) |
| Metadata DB (KV/Postgres)   | Convex database               |
| Admin UI                    | Vite + React admin panel      |

Because Convex HTTP actions cap requests/responses at **20 MB**:

- **API uploads** (`POST /api/files`) are limited to **15 MB**.
- **Panel uploads** use presigned upload URLs (client → object storage
  directly), so they support up to `MAX_UPLOAD_MB` (default **512 MB**).
- **Downloads** ≤ 15 MB are proxied through the function (200 + attachment
  headers); larger files get a 302 redirect to the signed URL.

There is no self-hosted/VPS mode in this codebase — everything runs on Convex.

---

## Local development

```bash
bun install
bunx convex dev            # terminal 1 — runs the backend (starts codegen)
bun dev                    # terminal 2 — runs the admin UI
```

The public API is served by the Convex dev process. In the UI, `VITE_CONVEX_URL`
points the app at the backend; public download links are derived from it
(`.convex.cloud` → `.convex.site`), or override with `VITE_SITE_URL`.

Default owner/admin credentials for `POST /api/login`:
`Panxcz` / `Panxxcz`. Override with `ADMIN_USERNAME` / `ADMIN_PASSWORD` in
production (see Environment variables).

**Demo mode:** on the sign-in page, click **"Continue as Guest"** — no email
provider or configuration needed. Production sign-in uses email OTP (handled
by the template's provider).

---

## Environment variables

**Frontend (`.env.local` / Vercel):**

| Variable            | Required | Description |
| ------------------- | -------- | ----------- |
| `VITE_CONVEX_URL`   | ✅        | Convex deployment URL (from Convex dashboard → Settings) |
| `VITE_SITE_URL`     | –        | Optional override for the public download base URL |

**Backend (Convex dashboard → Settings → Environment Variables):**

| Variable            | Default     | Description |
| ------------------- | ----------- | ----------- |
| `ADMIN_USERNAME`    | `Panxcz`    | Username for `POST /api/login` |
| `ADMIN_PASSWORD`    | `Panxxcz`   | Password for `POST /api/login` (set a strong one in production) |
| `MAX_UPLOAD_MB`     | `512`       | Max upload size in MB (panel uploads) |

---

## Deployment

### 1. Backend (Convex — the "server")

```bash
bunx convex deploy
```

1. Set `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `MAX_UPLOAD_MB` in
   **Settings → Environment Variables** on the Convex dashboard.
2. Note the **site URL** (`https://<deployment>.convex.site`) — this is where
   the REST API and public downloads live.

### 2. Frontend (Vercel)

1. Push the repo to GitHub and import it in Vercel.
2. Framework preset: **Vite** · Build: `bun run build` · Output: `dist`.
3. Add the env var `VITE_CONVEX_URL` = `https://<deployment>.convex.cloud`.
4. Deploy. The admin panel is at your Vercel URL; the API/downloads are on the
   Convex site URL.

> No Vercel Protection Bypass header is needed: downloads go through the
> Convex site (public by design) and the admin panel is protected by Convex
> Auth. If you enable Vercel Deployment Protection on the dashboard itself,
> use Vercel's built-in "Protection Bypass for Automation" for CI access.

### 3. Smoke test after deploy

```bash
curl https://<deployment>.convex.site/health
# {"status":"ok"}
```

---

## REST API

Base URL: `https://<deployment>.convex.site`

| Method | Path            | Auth         | Description |
| ------ | --------------- | ------------ | ----------- |
| POST   | `/api/login`    | public       | `{username, password}` → `{token, expiresAt}` (24 h) |
| POST   | `/api/files`    | Bearer token | multipart upload (`file`, `name`?, `version`?, `note`?) |
| GET    | `/api/files`    | Bearer token | list files with metadata |
| DELETE | `/api/files/:id`| Bearer token | delete file + bytes |
| GET    | `/files/:id`    | public       | download (stream ≤15 MB, else 302) |
| GET    | `/health`       | public       | `{"status":"ok"}` |

```bash
# login
TOKEN=$(curl -s -X POST https://<site>.convex.site/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-password"}' | jq -r .token)

# upload
curl -X POST https://<site>.convex.site/api/files \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@build.apk" -F "version=1.0.3"

# list
curl https://<site>.convex.site/api/files -H "Authorization: Bearer $TOKEN"

# download (public)
curl -L -O https://<site>.convex.site/files/<id>
```

Response for uploads: `{id, name, version, note, size, sha256, contentType, url}`.

---

## Security notes (spec section 5 & 9)

- Uploaded bytes are **never executed or parsed** — the server only stores and
  serves them.
- Stored filenames are server-generated ids; user input is only ever used for
  the `Content-Disposition` display name (sanitized). Path traversal is
  impossible.
- Every upload is **SHA-256 hashed server-side** and served via the
  `X-Checksum-Sha256` header.
- API tokens are stored as **hashes**, expire, and can be revoked from the
  panel. `POST /api/login` is rate-limited to 5 failed attempts/min/IP.
- Responses include `X-Content-Type-Options: nosniff`-equivalent safety via
  explicit `Content-Type` mapping; no auth bypass mechanisms are implemented.

---

## Acceptance tests (spec section 6)

Run against the deployed site (`BASE=https://<deployment>.convex.site`):

1. **Upload .apk** → response contains `id` and `sha256`; download via
   `GET /files/:id` returns the same bytes (`cmp` clean).
2. **Public download** → `curl -L $BASE/files/<id>` → 200 without auth;
   `POST /api/files` without a token → `401`.
3. **Login** → wrong credentials → `401` (5 fails/min → `429`); correct
   credentials → token works on all admin endpoints.
4. **Content types** → upload `.sh` and `.dll`; their downloads return
   `text/x-shellscript` and `application/octet-stream`.
5. **No overwrite** → two uploads get distinct ids; deleting one leaves the
   other downloadable.
6. **Path traversal** → any id that isn't a real file id → `404`; user input is
   never used as a path.
7. **Persistence** → restart/redeploy → files and metadata remain (Convex DB +
   object storage).
