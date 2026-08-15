# Hooklog — Webhook Receiver Admin Panel

A dead-simple webhook receiver + admin panel. Create hook URLs with one click,
point your cheat/script at them, get the exact response you configured, and see
every request (method, headers, query, body) logged in the dashboard.

**Stack:** Vite · React 19 · TypeScript · Tailwind v4 · shadcn/ui · Convex
(backend + database) · Convex Auth

> **About the stack:** this project runs on React + Vite with Convex instead of
> Next.js. Convex is the backend: the webhook endpoints are Convex HTTP actions
> (live at `https://<project>.convex.site/api/hook/...`) and all data lives in
> the Convex database. The admin UI is a static Vite app that deploys to Vercel
> in minutes. No Next.js API routes, no Postgres, no SQLite to manage — and no
> `DATABASE_URL` / `NEXTAUTH_SECRET` needed.

---

## What you get

| Feature | Where |
| --- | --- |
| Public hook endpoint `POST`/`GET` `/api/hook/<path>` or `/api/hook?key=<path>` | `src/convex/http.ts` |
| Parses `application/json`, `x-www-form-urlencoded`, `multipart/form-data`, raw text | `src/convex/http.ts` |
| Configurable response per hook (status 100–599 + body + content type) | Admin → hook settings |
| Secret token per hook, generated automatically (rotate anytime) | Admin → hook settings |
| Every request logged (method, URL, headers, query, body, IP, status) | `src/convex/requests.ts` |
| Dashboard, hooks list, per-hook settings, request history | `src/pages/*` |
| Auth: email OTP **or demo mode** (anonymous "Continue as Guest") | `src/pages/Auth.tsx` |

## Quick start (local)

```bash
bun install
bun convex dev          # runs the local Convex backend (keep this open)
bun run dev             # Vite dev server
```

Open the app, sign in (email OTP or "Continue as Guest"), and create a hook.

### Demo mode (no login)

The template ships with anonymous auth. On the sign-in page, click
**Continue as Guest** — you get a working session with no email, no password.
Anyone on your deployment can do this, so only use it internally. To disable it,
remove `Anonymous` from the providers in `src/convex/auth.ts` (see
`@convex-dev/auth` docs).

## Using a hook

Every hook gets a public URL (no login, no Vercel protection applies — see
[Security](#security)):

```
https://<project>.convex.site/api/hook/<path>
```

Send the token any of these ways (the token is shown in the hook settings):

```bash
# header
curl -X POST "https://<project>.convex.site/api/hook/license-check" \
  -H "Content-Type: application/json" \
  -H "x-hook-token: <TOKEN>" \
  -d '{"hwid":"AB12-CD34"}'

# Authorization bearer
curl -X POST "https://<project>.convex.site/api/hook/license-check" \
  -H "Authorization: Bearer <TOKEN>" \
  -d 'hwid=AB12-CD34'

# query param (?token= or ?bypass=)
curl "https://<project>.convex.site/api/hook/license-check?bypass=<TOKEN>&hwid=AB12-CD34"
```

Behaviour:

- Unknown path → `404 {"error":"hook not found"}`
- Disabled hook → `403 {"error":"hook disabled"}`
- Method not allowed → `405 {"error":"method not allowed","allowed":[...]}`
- Missing/wrong token → `403 {"error":"unauthorized",...}`
- All good → your configured status + body (default `200 {"ok":true}`)
- CORS is wide open (`*`) so browser scripts work too; `OPTIONS` preflight returns `204`.

## Environment variables

The Convex project and auth keys are already configured in this workspace. If
you deploy a fresh clone:

| Variable | Where | Required |
| --- | --- | --- |
| `VITE_CONVEX_URL` | Vercel (frontend) | ✅ — `https://<project>.convex.cloud` from your Convex project |
| `VITE_WEBHOOK_BASE_URL` | Vercel (frontend, optional) | Only if your webhook host isn't `<project>.convex.site` |
| `CONVEX_DEPLOYMENT` | Convex dashboard (Deployments → Environment Variables) | ✅ for `convex deploy` |
| `SITE_URL` | Convex dashboard | ✅ for auth |
| `JWKS`, `JWT_PRIVATE_KEY` | Convex dashboard (already set in this workspace) | for Convex Auth |
| `VLY_APP_NAME` | Convex dashboard (optional) | shows your app name in OTP emails |

There is **no** `DATABASE_URL`/`NEXTAUTH_SECRET`/`ADMIN_PASSWORD` — Convex is the
database and Convex Auth handles authentication.

## Deploying to Vercel (under 10 minutes)

1. **Push to GitHub** — create a repo and push this folder.
2. **Convex project** (one-time): create a project at
   [dashboard.convex.dev](https://dashboard.convex.dev) linked to the same repo,
   or run `npx convex deploy` locally after `npx convex login`.
   Copy the **production URL** (`https://<project>.convex.cloud`) and the site
   URL (`https://<project>.convex.site`).
3. **Vercel**: import the GitHub repo → framework preset **Vite** →
   Build command `bun run build` (or `npm run build`) → Output `dist`.
4. **Env vars in Vercel** (Project → Settings → Environment Variables):
   - `VITE_CONVEX_URL=https://<project>.convex.cloud`
   - (only if custom host) `VITE_WEBHOOK_BASE_URL=https://<your-domain>`
5. **Env vars in Convex dashboard** (Deployments → your deployment →
   Environment Variables): `SITE_URL=https://<your-vercel-domain>` (plus the auth
   keys the template ships with).
6. **Deploy** — done. Your admin panel is at the Vercel URL; your hooks are at
   `https://<project>.convex.site/api/hook/<path>`.

> Keep `convex/http.ts` deployed on the same Convex project as the frontend —
> `VITE_CONVEX_URL` and the site URL share the project.

## Security

- **Vercel Deployment Protection:** it does *not* apply to the webhook
  endpoints, because those run on `*.convex.site`, not on Vercel functions. No
  `x-vercel-protection-bypass` header is needed. For compatibility, the endpoint
  *also* accepts `x-vercel-protection-bypass` and `?bypass=` as aliases for your
  hook token, so a caller can authenticate the same way everywhere.
- **Admin panel:** all `/dashboard/*` routes are behind `RequireAuth` and every
  query/mutation checks the signed-in user.
- **Hooks:** protect them with the per-hook token (`requireToken`, on by
  default). Tokens are compared in constant time. Disable a hook anytime.
- **Logging:** bodies/headers are truncated (100 KB) before storage.

## Project structure

```
src/
├── convex/
│   ├── schema.ts        # hooks + requests tables
│   ├── hooks.ts         # CRUD, token generation, path lookup
│   ├── requests.ts      # request history queries + logging
│   └── http.ts          # the public webhook endpoint (/api/hook/...)
├── pages/
│   ├── Landing.tsx      # marketing landing page
│   ├── Auth.tsx         # sign-in (email OTP / guest demo)
│   ├── Dashboard.tsx    # admin shell (sidebar + mobile drawer)
│   ├── Overview.tsx     # stats + recent requests
│   ├── Hooks.tsx        # hook list + create/edit/delete
│   ├── HookDetail.tsx   # per-hook settings, token, URL, history
│   └── Requests.tsx     # all captured requests, filterable
├── components/panel/    # PageHeader, StatCard, RequestTable, dialogs, badges
└── lib/webhook.ts       # webhook URL/curl helpers
```

## Testing

```bash
bunx convex dev --once && bunx tsc -b --noEmit   # backend + typecheck
bun run dev                                       # frontend
```

Create a hook, then:

```bash
curl -X POST "https://<project>.convex.site/api/hook/<path>" \
  -H "Content-Type: application/json" \
  -H "x-hook-token: <TOKEN>" -d '{"hello":"world"}'
```

The request appears in **Overview → Recent requests** immediately.
