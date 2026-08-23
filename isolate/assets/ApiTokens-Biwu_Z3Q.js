import{j as e}from"./framer-motion-DiNnH09Z.js";import{B as g}from"./badge-C0H1lq_1.js";import{c as h,B as C}from"./button-vFXXy3F_.js";import{C as d,a as f,b as j,c as v,d as p}from"./card-DYbWhX3_.js";import{D as I,b as O,c as D,d as P,e as A}from"./dialog-p0oWueYb.js";import{A as _,a as L,T as $,b as R,c as V,d as U,e as B,f as z,g as q,h as F}from"./alert-dialog-CsFdOHE4.js";import{L as H,I as J}from"./label-DB3CK22c.js";import{p as M,q as K,s as G,t as Q}from"./radix-ui-CodNurnc.js";import{C as k}from"./CopyButton-vK37UYNR.js";import{P as W}from"./PageHeader-0ida6eV1.js";import{d as Y,b as X,L as T,a as S,T as Z,t as y}from"./index-BeAJarUO.js";import{c as N}from"./format-CUrzl6wJ.js";import{r as b}from"./react-vendor-BsvDnyai.js";import{K as ee}from"./key-round-BoFSfSYM.js";import{P as se}from"./plus-D8Izax7J.js";import"./charts-HwRvn74Q.js";import"./x-CeKOeuCG.js";import"./check-BrDel1YY.js";function te({className:t,...s}){return e.jsx(M,{"data-slot":"tabs",className:h("flex flex-col gap-2",t),...s})}function re({className:t,...s}){return e.jsx(K,{"data-slot":"tabs-list",className:h("bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]",t),...s})}function c({className:t,...s}){return e.jsx(G,{"data-slot":"tabs-trigger",className:h("data-[state=active]:bg-background dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",t),...s})}function l({className:t,...s}){return e.jsx(Q,{"data-slot":"tabs-content",className:h("flex-1 outline-none",t),...s})}function a({code:t,className:s}){return e.jsxs("div",{className:h("relative overflow-hidden rounded-lg border border-border bg-zinc-950",s),children:[e.jsx("div",{className:"absolute right-2 top-2 z-10",children:e.jsx(k,{value:t,label:"Code",variant:"ghost",size:"icon",className:"text-zinc-400 hover:bg-white/10 hover:text-zinc-100"})}),e.jsx("pre",{className:"max-h-[480px] overflow-auto p-4 font-mono text-[12px] leading-relaxed text-zinc-200",children:e.jsx("code",{children:t})})]})}const r="https://lovable-dove-890.convex.cloud".replace(/\.convex\.cloud$/,".convex.site")??"https://<deployment>.convex.site",ae=`// lib/nameserver.ts  — works in route handlers, server actions & client components
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

// connect("LIC-XXXX-XXXX-XXXX-XXXX-XXXX", "device-abc-123").then(console.log);`,oe=`# nameserver.py — pip install requests
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


# connect("LIC-XXXX-XXXX-XXXX-XXXX-XXXX", "device-abc-123")`,ie=`#!/usr/bin/env bash
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
// val result = NameserverApi.connect("LIC-XXXX-XXXX-XXXX-XXXX-XXXX", "device-abc-123")`,le=`// udp-handshake.mjs — stage 2 after a successful /connect
// The app calls librudp.createPipe(endpoint) → UDP handshake. This is a
// reliable-UDP pipe over a real UDP socket; run the relay on your own host
// (Convex serves HTTP only — it cannot listen on raw UDP). Adjust the packet
// layout below to match your binary's expectation.
import dgram from "node:dgram";

const CONVEX_SITE = "${r}";

// 1. HTTP connect first — validates the license key, binds the device.
const res = await fetch(\`\${CONVEX_SITE}/connect\`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    license: "NS-XXXX-XXXX-XXXX-XXXX-XXXX",
    device: "device-abc",
  }),
});
const auth = await res.json();
if (!auth.ok) throw new Error(auth.error ?? "connect rejected");

// 2. librudp.createPipe(endpoint) — reliable-UDP pipe over a UDP socket.
//    endpoint format: udp://<host>:<port> (your UDP relay, not Convex)
function createPipe(endpoint) {
  const { hostname, port } = new URL(endpoint);
  const socket = dgram.createSocket("udp4");
  return {
    send(payload) {
      return new Promise((resolve, reject) =>
        socket.send(payload, Number(port), hostname, (err) =>
          err ? reject(err) : resolve()),
      );
    },
    onMessage(fn) {
      socket.on("message", fn);
    },
    close() {
      socket.close();
    },
  };
}

const pipe = createPipe("udp://127.0.0.1:9000");

// 3. Handshake: prove the session. The relay re-validates license + device
//    against /connect, then opens the UDP session.
const handshake = Buffer.from(JSON.stringify({
  type: "handshake",
  license: "NS-XXXX-XXXX-XXXX-XXXX-XXXX",
  device: "device-abc",
  t: Math.floor(Date.now() / 1000),
}));

pipe.onMessage((msg) => {
  const ack = JSON.parse(msg.toString());
  if (ack.ok) {
    console.log("UDP handshake ok — session ready");
    // >>> your runtime starts here <<<
  } else {
    console.error("UDP handshake rejected:", ack.error);
  }
  pipe.close();
});
await pipe.send(handshake);
setTimeout(() => pipe.close(), 5000); // timeout guard`,de=[{method:"POST",path:"/connect",auth:"public",desc:'Validate a license key. POST only (GET → 405). JSON body {"license"|"key", "device"|"hwid", "game"?} (primebit-style loaders send {"key", "hwid", "game"} — errors reply "Invalid key" / "Key expired" / "Key banned" / "Device limit" / "Wrong Game Key", success includes expires + the loader URL) — or the Havest-style form (game, version, user_key, serial, resource). Add "action": "reset" to unbind the device. Keys/devices are case-insensitive; 5 failed attempts/min/IP → 429',methodClass:"bg-emerald-600/90 text-white"},{method:"POST",path:"/api/login",auth:"public",desc:"Exchange { username, password } for { token, expiresAt } (24 h)",methodClass:"bg-emerald-600/90 text-white"},{method:"GET",path:"/api/files",auth:"Bearer",desc:"List uploaded files with metadata (size, sha256, download count)",methodClass:"bg-sky-600/90 text-white"},{method:"POST",path:"/api/files",auth:"Bearer",desc:"Upload a file — multipart fields: file, name?, version?, note?",methodClass:"bg-emerald-600/90 text-white"},{method:"GET",path:"/databases/:id",auth:"public",desc:"APK response URL — download a game loader (returned as data.url by /connect)",methodClass:"bg-sky-600/90 text-white"},{method:"DELETE",path:"/api/files/:id",auth:"Bearer",desc:"Delete a file and its bytes",methodClass:"bg-red-600/90 text-white"}];function pe(){const t=S(X.files.createApiToken),[s,m]=b.useState(""),[u,n]=b.useState(!1),[o,E]=b.useState(null),w=async i=>{i.preventDefault(),n(!0);try{const x=await t({label:s||void 0});E(x),m("")}catch(x){y.error(x instanceof Error?x.message:"Failed to create token")}finally{n(!1)}};return e.jsxs(e.Fragment,{children:[e.jsxs(d,{className:"border-border/70",children:[e.jsxs(f,{children:[e.jsx(j,{className:"text-base",children:"Create an API token"}),e.jsxs(v,{children:["Tokens authenticate the REST API (",e.jsx("code",{className:"rounded bg-muted px-1 py-0.5 text-xs",children:"/api/files"}),"and friends) via"," ",e.jsx("code",{className:"rounded bg-muted px-1 py-0.5 text-xs",children:"Authorization: Bearer <token>"}),". The plaintext is shown exactly once."]})]}),e.jsx(p,{children:e.jsxs("form",{onSubmit:w,className:"flex flex-col gap-3 sm:flex-row sm:items-end",children:[e.jsxs("div",{className:"flex-1 space-y-2",children:[e.jsx(H,{htmlFor:"token-label",children:"Label (optional)"}),e.jsx(J,{id:"token-label",value:s,onChange:i=>m(i.target.value),placeholder:"e.g. my-python-bot",maxLength:60})]}),e.jsxs(C,{type:"submit",disabled:u,className:"cursor-pointer",children:[u?e.jsx(T,{className:"size-4 animate-spin"}):e.jsx(se,{className:"size-4"}),"Create token"]})]})})]}),e.jsx(I,{open:o!==null,onOpenChange:i=>!i&&E(null),children:e.jsxs(O,{className:"sm:max-w-md",children:[e.jsxs(D,{children:[e.jsx(P,{children:"API token created"}),e.jsxs(A,{className:"flex items-center gap-1.5",children:[e.jsx(Z,{className:"size-3.5 text-amber-500"}),"Shown once — copy it now. Expires"," ",o?N(o.expiresAt):"—","."]})]}),e.jsxs("div",{className:"flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-3",children:[e.jsx("code",{className:"min-w-0 flex-1 break-all font-mono text-xs",children:o?.token}),e.jsx(k,{value:o?.token??"",label:"Token"})]})]})})]})}function he({token:t}){const s=S(X.files.revokeApiToken),m=t.expiresAt<Date.now(),u=async()=>{try{await s({id:t._id}),y.success("Token revoked — it can no longer authenticate")}catch(n){y.error(n instanceof Error?n.message:"Failed to revoke token")}};return e.jsxs("li",{className:"flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center",children:[e.jsxs("div",{className:"min-w-0 flex-1",children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx("p",{className:"truncate text-sm font-medium",children:t.label||"unlabeled"}),m?e.jsx(g,{variant:"secondary",className:"text-muted-foreground",children:"expired"}):e.jsx(g,{className:"bg-emerald-600/90 text-white hover:bg-emerald-600/90",children:"active"})]}),e.jsxs("p",{className:"mt-0.5 truncate text-xs text-muted-foreground",children:["created ",N(t.createdAt)," · expires"," ",N(t.expiresAt)]})]}),e.jsxs(_,{children:[e.jsx(L,{asChild:!0,children:e.jsx(C,{variant:"outline",size:"icon-sm",className:"cursor-pointer text-destructive","aria-label":"Revoke token",children:e.jsx($,{className:"size-3.5"})})}),e.jsxs(R,{children:[e.jsxs(V,{children:[e.jsx(U,{children:"Revoke this token?"}),e.jsx(B,{children:"Anything using it will immediately lose access to the API. The token is deleted permanently."})]}),e.jsxs(z,{children:[e.jsx(q,{className:"cursor-pointer",children:"Cancel"}),e.jsx(F,{className:"cursor-pointer bg-destructive text-white hover:bg-destructive/90",onClick:u,children:"Revoke"})]})]})]})]})}function Oe(){const t=Y(X.files.listApiTokens);return t===void 0?e.jsx("div",{className:"flex min-h-[40vh] items-center justify-center",children:e.jsx(T,{className:"size-6 animate-spin text-muted-foreground"})}):e.jsxs("div",{className:"space-y-8",children:[e.jsx(W,{title:"API & Tokens",description:"Create API tokens and grab ready-to-use client libraries for your apps and scripts."}),e.jsxs(d,{className:"border-border/70",children:[e.jsxs(f,{children:[e.jsx(j,{className:"text-base",children:"Base URL & endpoints"}),e.jsx(v,{children:"All routes are served from the Convex site URL. The connect endpoint is public; admin routes use a Bearer token."})]}),e.jsxs(p,{className:"space-y-4",children:[e.jsxs("div",{className:"flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-3 font-mono text-[12.5px]",children:[e.jsx("span",{className:"truncate",children:r}),e.jsx(k,{value:r,label:"URL",size:"icon"})]}),e.jsx("div",{className:"overflow-x-auto rounded-lg border border-border",children:e.jsxs("table",{className:"w-full text-left text-sm",children:[e.jsx("thead",{children:e.jsxs("tr",{className:"border-b border-border text-xs text-muted-foreground",children:[e.jsx("th",{className:"px-3 py-2.5 font-medium",children:"Method"}),e.jsx("th",{className:"px-3 py-2.5 font-medium",children:"Path"}),e.jsx("th",{className:"px-3 py-2.5 font-medium",children:"Auth"}),e.jsx("th",{className:"px-3 py-2.5 font-medium",children:"Description"})]})}),e.jsx("tbody",{className:"divide-y divide-border",children:de.map(s=>e.jsxs("tr",{className:"hover:bg-muted/30",children:[e.jsx("td",{className:"px-3 py-2.5",children:e.jsx(g,{className:s.methodClass,children:s.method})}),e.jsx("td",{className:"px-3 py-2.5 font-mono text-xs",children:s.path}),e.jsx("td",{className:"px-3 py-2.5 text-xs text-muted-foreground",children:s.auth}),e.jsx("td",{className:"px-3 py-2.5 text-xs text-muted-foreground",children:s.desc})]},s.method+s.path))})]})})]})]}),e.jsxs("div",{className:"space-y-4",children:[e.jsx(pe,{}),e.jsxs(d,{className:"border-border/70",children:[e.jsxs(f,{children:[e.jsxs(j,{className:"text-base",children:["Tokens",e.jsxs("span",{className:"ml-2 text-sm font-normal text-muted-foreground",children:[t.length," total"]})]}),e.jsx(v,{children:"Revoke a token any time to cut off whatever is using it."})]}),e.jsx(p,{className:"px-0",children:t.length===0?e.jsxs("div",{className:"flex flex-col items-center gap-3 py-10 text-center",children:[e.jsx(ee,{className:"size-8 text-muted-foreground/50"}),e.jsx("p",{className:"text-sm text-muted-foreground",children:"No API tokens yet — create one above."})]}):e.jsx("ul",{className:"divide-y divide-border",children:t.map(s=>e.jsx(he,{token:s},s._id))})})]})]}),e.jsxs("div",{className:"space-y-4",children:[e.jsxs("div",{children:[e.jsx("h2",{className:"text-base font-semibold tracking-tight",children:"Client libraries"}),e.jsxs("p",{className:"mt-1 text-sm text-muted-foreground",children:["Copy-paste ready. Replace"," ",e.jsx("code",{className:"rounded bg-muted px-1 py-0.5 text-xs",children:"NS-XXXX-…"})," ","with a generated key — the server is detected from the key automatically. Each client asks the user for their license key and only proceeds when ",e.jsx("code",{className:"rounded bg-muted px-1 py-0.5 text-xs",children:"ok: true"}),"."]})]}),e.jsx(d,{className:"border-border/70",children:e.jsx(p,{className:"pt-6",children:e.jsxs(te,{defaultValue:"nextjs",children:[e.jsxs(re,{children:[e.jsx(c,{value:"nextjs",children:"Next.js"}),e.jsx(c,{value:"nodejs",children:"Node.js"}),e.jsx(c,{value:"python",children:"Python"}),e.jsx(c,{value:"shell",children:"Shell (.sh)"}),e.jsx(c,{value:"kotlin",children:"Android Kotlin"})]}),e.jsx(l,{value:"nextjs",className:"mt-4",children:e.jsx(a,{code:ae})}),e.jsx(l,{value:"nodejs",className:"mt-4",children:e.jsx(a,{code:ne})}),e.jsx(l,{value:"python",className:"mt-4",children:e.jsx(a,{code:oe})}),e.jsx(l,{value:"shell",className:"mt-4",children:e.jsx(a,{code:ie})}),e.jsx(l,{value:"kotlin",className:"mt-4",children:e.jsx(a,{code:ce})})]})})})]}),e.jsxs(d,{className:"border-border/70",children:[e.jsxs(f,{children:[e.jsx(j,{className:"text-base",children:"UDP handshake — librudp.createPipe(endpoint)"}),e.jsx(v,{children:"After a successful connect, the app opens a reliable-UDP pipe and does a UDP handshake before starting the runtime. Convex serves HTTP only, so the UDP relay runs on your own host — the snippet below is the client side."})]}),e.jsxs(p,{className:"space-y-3",children:[e.jsxs("p",{className:"text-xs text-muted-foreground",children:["Flow:"," ",e.jsx("code",{className:"rounded bg-muted px-1 py-0.5 text-xs",children:"POST /connect"})," ","(validate key, bind device) →"," ",e.jsx("code",{className:"rounded bg-muted px-1 py-0.5 text-xs",children:"librudp.createPipe(endpoint)"})," ","→ send handshake packet (license + device + timestamp) → relay re-validates and replies"," ",e.jsx("code",{className:"rounded bg-muted px-1 py-0.5 text-xs",children:'{"ok":true}'})," ","→ session starts. The endpoint is"," ",e.jsx("code",{className:"rounded bg-muted px-1 py-0.5 text-xs",children:"udp://<host>:<port>"}),"."]}),e.jsx(a,{code:le})]})]})]})}export{Oe as default};
