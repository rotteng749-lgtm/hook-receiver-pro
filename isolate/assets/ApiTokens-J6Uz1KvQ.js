import{j as e}from"./framer-motion-DiNnH09Z.js";import{B as j}from"./badge-DDoyE4wm.js";import{B as X}from"./button-DRCH8lk6.js";import{C as x,a as v,b,c as g,d as u}from"./card-po9JgwVD.js";import{D as I,b as O,c as A,d as _,e as L}from"./dialog-Dx1pbALc.js";import{A as D,a as $,T as R,b as V,c as B,d as P,e as z,f as q,g as U,h as F}from"./alert-dialog-CbQSIuYu.js";import{L as J,I as H}from"./label-z-PoX0LR.js";import{p as K,q as M,s as G,t as Q}from"./radix-ui-Djy0fNbr.js";import{c as d}from"./utils-BLLKATT3.js";import{C as k}from"./CopyButton-kx584MpK.js";import{P as W}from"./PageHeader-0ida6eV1.js";import{d as Y,b as E,L as T,a as S,T as Z,t as y}from"./index-BUHjewuj.js";import{c as N}from"./format-CUrzl6wJ.js";import{r as f}from"./react-vendor-BsvDnyai.js";import{K as ee}from"./key-round-BWfvAOib.js";import{P as se}from"./plus-B7FZwYUD.js";import"./x-BCNCwmjP.js";import"./charts-C_qm9soe.js";import"./check-cMWTUOPe.js";function te({className:t,...s}){return e.jsx(K,{"data-slot":"tabs",className:d("flex flex-col gap-2",t),...s})}function re({className:t,...s}){return e.jsx(M,{"data-slot":"tabs-list",className:d("bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]",t),...s})}function o({className:t,...s}){return e.jsx(G,{"data-slot":"tabs-trigger",className:d("data-[state=active]:bg-background dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",t),...s})}function c({className:t,...s}){return e.jsx(Q,{"data-slot":"tabs-content",className:d("flex-1 outline-none",t),...s})}function l({code:t,className:s}){return e.jsxs("div",{className:d("relative overflow-hidden rounded-lg border border-border bg-zinc-950",s),children:[e.jsx("div",{className:"absolute right-2 top-2 z-10",children:e.jsx(k,{value:t,label:"Code",variant:"ghost",size:"icon",className:"text-zinc-400 hover:bg-white/10 hover:text-zinc-100"})}),e.jsx("pre",{className:"max-h-[480px] overflow-auto p-4 font-mono text-[12px] leading-relaxed text-zinc-200",children:e.jsx("code",{children:t})})]})}const r="https://brave-lobster-493.convex.cloud".replace(/\.convex\.cloud$/,".convex.site")??"https://<deployment>.convex.site",ae=`// lib/nameserver.ts  — works in route handlers, server actions & client components
const CONVEX_SITE = process.env.CONVEX_SITE_URL ?? "${r}";

// The app asks the user for their license key. 'device' binds 1 key = 1 device.
export async function connect(license: string, device?: string) {
  const res = await fetch(\`\${CONVEX_SITE}/connect\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ license, device }),
  });
  return res.json(); // { ok, server, key } | { ok: false, error }
}

export async function apiLogin(username: string, password: string) {
  const res = await fetch(\`\${CONVEX_SITE}/api/login\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return res.json(); // { token, expiresAt } — valid 24 h
}

export async function listFiles(apiToken: string) {
  const res = await fetch(\`\${CONVEX_SITE}/api/files\`, {
    headers: { Authorization: \`Bearer \${apiToken}\` },
  });
  return res.json();
}`,ne=`// nameserver.mjs — Node.js 18+ (no framework)
const CONVEX_SITE = process.env.CONVEX_SITE_URL ?? "${r}";

// The app asks the user for their license key. 'device' binds 1 key = 1 device.
export async function connect(license, device) {
  const res = await fetch(\`\${CONVEX_SITE}/connect\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ license, device }),
  });
  return res.json();
}

export async function listFiles(apiToken) {
  const res = await fetch(\`\${CONVEX_SITE}/api/files\`, {
    headers: { Authorization: \`Bearer \${apiToken}\` },
  });
  return res.json();
}

// connect("LIC-XXXX-XXXX-XXXX-XXXX-XXXX", "device-abc-123").then(console.log);`,ie=`# nameserver.py — pip install requests
import requests

CONVEX_SITE = "${r}"


def connect(license: str, device: str | None = None) -> dict:
    # The app asks the user for their license key; 'device' binds 1 key = 1 device.
    r = requests.post(
        f"{CONVEX_SITE}/connect", json={"license": license, "device": device}
    )
    return r.json()  # {"ok": True, ...} or {"ok": False, "error": ...}


def api_login(username: str, password: str) -> dict:
    r = requests.post(
        f"{CONVEX_SITE}/api/login",
        json={"username": username, "password": password},
    )
    return r.json()  # {"token": ..., "expiresAt": ...}


def list_files(api_token: str) -> dict:
    r = requests.get(
        f"{CONVEX_SITE}/api/files",
        headers={"Authorization": f"Bearer {api_token}"},
    )
    return r.json()


# connect("LIC-XXXX-XXXX-XXXX-XXXX-XXXX", "device-abc-123")`,oe=`#!/usr/bin/env bash
# nameserver.sh — gate your .sh app with a license key
# Usage: ./nameserver.sh [LICENSE]   (prompts when not given)
set -euo pipefail

CONVEX_SITE="$CONVEX_SITE_URL"
[ -n "$CONVEX_SITE" ] || CONVEX_SITE="https://lovable-dove-890.convex.site"

# --- 1. Stable device id (1 key = 1 device) ---
DEVICE_ID=""
if [ -r /etc/machine-id ]; then
  DEVICE_ID="$(tr -d '\\n' < /etc/machine-id)"
else
  DEVICE_FILE="$HOME/.nameserver-device"
  [ -f "$DEVICE_FILE" ] || head -c 32 /dev/urandom | md5sum | cut -d' ' -f1 > "$DEVICE_FILE"
  DEVICE_ID="$(tr -d '\\n' < "$DEVICE_FILE")"
fi

# --- 2. Ask the user for their license key ---
LICENSE="$1"
if [ -z "$LICENSE" ]; then
  read -r -p "Enter your license key: " LICENSE
fi
LICENSE="$(echo "$LICENSE" | tr -d '[:space:]')"
[ -n "$LICENSE" ] || { echo "No license key entered." >&2; exit 1; }

# --- 3. Validate against /connect (server is detected from the key) ---
RESPONSE="$(curl -sS -X POST "$CONVEX_SITE/connect" \\
  -H "Content-Type: application/json" \\
  -d "{\\"license\\":\\"$LICENSE\\",\\"device\\":\\"$DEVICE_ID\\"}")"

# --- 4. Only continue when ok:true ---
if echo "$RESPONSE" | grep -q '"ok":true'; then
  echo "Connected - server $(echo "$RESPONSE" | sed -n 's/.*"code":"\\([^"]*\\)".*/\\1/p')"
  # >>> your app logic starts here <<<
else
  echo "License rejected: $(echo "$RESPONSE" | sed -n 's/.*"error":"\\([^"]*\\)".*/\\1/p')" >&2
  exit 1
fi`,ce=`// NameserverApi.kt — dependencies: implementation("com.squareup.okhttp3:okhttp:4.12.0")
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

object NameserverApi {
    private const val BASE_URL = "${r}"
    private val client = OkHttpClient()
    private val json = "application/json".toMediaType()

    // The app asks the user for their license key; 'device' binds 1 key = 1 device.
    suspend fun connect(license: String, device: String? = null): JSONObject = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("license", license)
            .put("device", device)
            .toString()
        val request = Request.Builder()
            .url("$BASE_URL/connect")
            .post(body.toRequestBody(json))
            .build()
        client.newCall(request).execute().use { response ->
            JSONObject(response.body?.string().orEmpty())
        }
    }

    suspend fun listFiles(apiToken: String): JSONObject = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url("$BASE_URL/api/files")
            .header("Authorization", "Bearer $apiToken")
            .build()
        client.newCall(request).execute().use { response ->
            JSONObject(response.body?.string().orEmpty())
        }
    }
}

// Usage (inside a coroutine):
// val result = NameserverApi.connect("LIC-XXXX-XXXX-XXXX-XXXX-XXXX", "device-abc-123")`,le=[{method:"POST",path:"/connect",auth:"public",desc:'Validate a license key. JSON body {"license"|"key", "device"|"hwid", "game"?} (primebit-style loaders send {"key", "hwid", "game"} — errors reply "Invalid key" / "Key expired" / "Key banned" / "Device limit" / "Wrong Game Key", success includes expires + the loader URL) — or the Havest-style form (game, version, user_key, serial, resource). Add "action": "reset" to unbind the device',methodClass:"bg-emerald-600/90 text-white"},{method:"GET",path:"/connect",auth:"public",desc:"Same via query string: ?license=LIC-…&device=device-abc&action=reset",methodClass:"bg-sky-600/90 text-white"},{method:"POST",path:"/api/login",auth:"public",desc:"Exchange { username, password } for { token, expiresAt } (24 h)",methodClass:"bg-emerald-600/90 text-white"},{method:"GET",path:"/api/files",auth:"Bearer",desc:"List uploaded files with metadata (size, sha256, download count)",methodClass:"bg-sky-600/90 text-white"},{method:"POST",path:"/api/files",auth:"Bearer",desc:"Upload a file — multipart fields: file, name?, version?, note?",methodClass:"bg-emerald-600/90 text-white"},{method:"GET",path:"/databases/:id",auth:"public",desc:"APK response URL — download a game loader (returned as data.url by /connect)",methodClass:"bg-sky-600/90 text-white"},{method:"DELETE",path:"/api/files/:id",auth:"Bearer",desc:"Delete a file and its bytes",methodClass:"bg-red-600/90 text-white"}];function de(){const t=S(E.files.createApiToken),[s,m]=f.useState(""),[h,a]=f.useState(!1),[n,C]=f.useState(null),w=async i=>{i.preventDefault(),a(!0);try{const p=await t({label:s||void 0});C(p),m("")}catch(p){y.error(p instanceof Error?p.message:"Failed to create token")}finally{a(!1)}};return e.jsxs(e.Fragment,{children:[e.jsxs(x,{className:"border-border/70",children:[e.jsxs(v,{children:[e.jsx(b,{className:"text-base",children:"Create an API token"}),e.jsxs(g,{children:["Tokens authenticate the REST API (",e.jsx("code",{className:"rounded bg-muted px-1 py-0.5 text-xs",children:"/api/files"}),"and friends) via"," ",e.jsx("code",{className:"rounded bg-muted px-1 py-0.5 text-xs",children:"Authorization: Bearer <token>"}),". The plaintext is shown exactly once."]})]}),e.jsx(u,{children:e.jsxs("form",{onSubmit:w,className:"flex flex-col gap-3 sm:flex-row sm:items-end",children:[e.jsxs("div",{className:"flex-1 space-y-2",children:[e.jsx(J,{htmlFor:"token-label",children:"Label (optional)"}),e.jsx(H,{id:"token-label",value:s,onChange:i=>m(i.target.value),placeholder:"e.g. my-python-bot",maxLength:60})]}),e.jsxs(X,{type:"submit",disabled:h,className:"cursor-pointer",children:[h?e.jsx(T,{className:"size-4 animate-spin"}):e.jsx(se,{className:"size-4"}),"Create token"]})]})})]}),e.jsx(I,{open:n!==null,onOpenChange:i=>!i&&C(null),children:e.jsxs(O,{className:"sm:max-w-md",children:[e.jsxs(A,{children:[e.jsx(_,{children:"API token created"}),e.jsxs(L,{className:"flex items-center gap-1.5",children:[e.jsx(Z,{className:"size-3.5 text-amber-500"}),"Shown once — copy it now. Expires"," ",n?N(n.expiresAt):"—","."]})]}),e.jsxs("div",{className:"flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-3",children:[e.jsx("code",{className:"min-w-0 flex-1 break-all font-mono text-xs",children:n?.token}),e.jsx(k,{value:n?.token??"",label:"Token"})]})]})})]})}function me({token:t}){const s=S(E.files.revokeApiToken),m=t.expiresAt<Date.now(),h=async()=>{try{await s({id:t._id}),y.success("Token revoked — it can no longer authenticate")}catch(a){y.error(a instanceof Error?a.message:"Failed to revoke token")}};return e.jsxs("li",{className:"flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center",children:[e.jsxs("div",{className:"min-w-0 flex-1",children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx("p",{className:"truncate text-sm font-medium",children:t.label||"unlabeled"}),m?e.jsx(j,{variant:"secondary",className:"text-muted-foreground",children:"expired"}):e.jsx(j,{className:"bg-emerald-600/90 text-white hover:bg-emerald-600/90",children:"active"})]}),e.jsxs("p",{className:"mt-0.5 truncate text-xs text-muted-foreground",children:["created ",N(t.createdAt)," · expires"," ",N(t.expiresAt)]})]}),e.jsxs(D,{children:[e.jsx($,{asChild:!0,children:e.jsx(X,{variant:"outline",size:"icon-sm",className:"cursor-pointer text-destructive","aria-label":"Revoke token",children:e.jsx(R,{className:"size-3.5"})})}),e.jsxs(V,{children:[e.jsxs(B,{children:[e.jsx(P,{children:"Revoke this token?"}),e.jsx(z,{children:"Anything using it will immediately lose access to the API. The token is deleted permanently."})]}),e.jsxs(q,{children:[e.jsx(U,{className:"cursor-pointer",children:"Cancel"}),e.jsx(F,{className:"cursor-pointer bg-destructive text-white hover:bg-destructive/90",onClick:h,children:"Revoke"})]})]})]})]})}function Oe(){const t=Y(E.files.listApiTokens);return t===void 0?e.jsx("div",{className:"flex min-h-[40vh] items-center justify-center",children:e.jsx(T,{className:"size-6 animate-spin text-muted-foreground"})}):e.jsxs("div",{className:"space-y-8",children:[e.jsx(W,{title:"API & Tokens",description:"Create API tokens and grab ready-to-use client libraries for your apps and scripts."}),e.jsxs(x,{className:"border-border/70",children:[e.jsxs(v,{children:[e.jsx(b,{className:"text-base",children:"Base URL & endpoints"}),e.jsx(g,{children:"All routes are served from the Convex site URL. The connect endpoint is public; admin routes use a Bearer token."})]}),e.jsxs(u,{className:"space-y-4",children:[e.jsxs("div",{className:"flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-3 font-mono text-[12.5px]",children:[e.jsx("span",{className:"truncate",children:r}),e.jsx(k,{value:r,label:"URL",size:"icon"})]}),e.jsx("div",{className:"overflow-x-auto rounded-lg border border-border",children:e.jsxs("table",{className:"w-full text-left text-sm",children:[e.jsx("thead",{children:e.jsxs("tr",{className:"border-b border-border text-xs text-muted-foreground",children:[e.jsx("th",{className:"px-3 py-2.5 font-medium",children:"Method"}),e.jsx("th",{className:"px-3 py-2.5 font-medium",children:"Path"}),e.jsx("th",{className:"px-3 py-2.5 font-medium",children:"Auth"}),e.jsx("th",{className:"px-3 py-2.5 font-medium",children:"Description"})]})}),e.jsx("tbody",{className:"divide-y divide-border",children:le.map(s=>e.jsxs("tr",{className:"hover:bg-muted/30",children:[e.jsx("td",{className:"px-3 py-2.5",children:e.jsx(j,{className:s.methodClass,children:s.method})}),e.jsx("td",{className:"px-3 py-2.5 font-mono text-xs",children:s.path}),e.jsx("td",{className:"px-3 py-2.5 text-xs text-muted-foreground",children:s.auth}),e.jsx("td",{className:"px-3 py-2.5 text-xs text-muted-foreground",children:s.desc})]},s.method+s.path))})]})})]})]}),e.jsxs("div",{className:"space-y-4",children:[e.jsx(de,{}),e.jsxs(x,{className:"border-border/70",children:[e.jsxs(v,{children:[e.jsxs(b,{className:"text-base",children:["Tokens",e.jsxs("span",{className:"ml-2 text-sm font-normal text-muted-foreground",children:[t.length," total"]})]}),e.jsx(g,{children:"Revoke a token any time to cut off whatever is using it."})]}),e.jsx(u,{className:"px-0",children:t.length===0?e.jsxs("div",{className:"flex flex-col items-center gap-3 py-10 text-center",children:[e.jsx(ee,{className:"size-8 text-muted-foreground/50"}),e.jsx("p",{className:"text-sm text-muted-foreground",children:"No API tokens yet — create one above."})]}):e.jsx("ul",{className:"divide-y divide-border",children:t.map(s=>e.jsx(me,{token:s},s._id))})})]})]}),e.jsxs("div",{className:"space-y-4",children:[e.jsxs("div",{children:[e.jsx("h2",{className:"text-base font-semibold tracking-tight",children:"Client libraries"}),e.jsxs("p",{className:"mt-1 text-sm text-muted-foreground",children:["Copy-paste ready. Replace"," ",e.jsx("code",{className:"rounded bg-muted px-1 py-0.5 text-xs",children:"NS-XXXX-…"})," ","with a generated key — the server is detected from the key automatically. Each client asks the user for their license key and only proceeds when ",e.jsx("code",{className:"rounded bg-muted px-1 py-0.5 text-xs",children:"ok: true"}),"."]})]}),e.jsx(x,{className:"border-border/70",children:e.jsx(u,{className:"pt-6",children:e.jsxs(te,{defaultValue:"nextjs",children:[e.jsxs(re,{children:[e.jsx(o,{value:"nextjs",children:"Next.js"}),e.jsx(o,{value:"nodejs",children:"Node.js"}),e.jsx(o,{value:"python",children:"Python"}),e.jsx(o,{value:"shell",children:"Shell (.sh)"}),e.jsx(o,{value:"kotlin",children:"Android Kotlin"})]}),e.jsx(c,{value:"nextjs",className:"mt-4",children:e.jsx(l,{code:ae})}),e.jsx(c,{value:"nodejs",className:"mt-4",children:e.jsx(l,{code:ne})}),e.jsx(c,{value:"python",className:"mt-4",children:e.jsx(l,{code:ie})}),e.jsx(c,{value:"shell",className:"mt-4",children:e.jsx(l,{code:oe})}),e.jsx(c,{value:"kotlin",className:"mt-4",children:e.jsx(l,{code:ce})})]})})})]})]})}export{Oe as default};
