import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyButton } from "@/components/panel/CopyButton";
import { PageHeader } from "@/components/panel/PageHeader";
import { CodeBlock } from "@/components/panel/CodeBlock";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { formatDateTime } from "@/lib/format";
import { motion } from "framer-motion";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/** Public HTTP routes live on the Convex site URL (<deployment>.convex.site). */
const SITE_URL =
  (import.meta.env.VITE_CONVEX_URL as string | undefined)?.replace(
    /\.convex\.cloud$/,
    ".convex.site",
  ) ?? "https://<deployment>.convex.site";

/* ------------------------- client libraries ------------------------- */

const nextjsCode = `// lib/nameserver.ts  — works in route handlers, server actions & client components
const CONVEX_SITE = process.env.CONVEX_SITE_URL ?? "${SITE_URL}";

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
}`;

const nodejsCode = `// nameserver.mjs — Node.js 18+ (no framework)
const CONVEX_SITE = process.env.CONVEX_SITE_URL ?? "${SITE_URL}";

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

// connect("LIC-XXXX-XXXX-XXXX-XXXX-XXXX", "device-abc-123").then(console.log);`;

const pythonCode = `# nameserver.py — pip install requests
import requests

CONVEX_SITE = "${SITE_URL}"


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


# connect("LIC-XXXX-XXXX-XXXX-XXXX-XXXX", "device-abc-123")`;

const shellCode = `#!/usr/bin/env bash
# nameserver.sh — gate your .sh app with a license key
# Usage: ./nameserver.sh [LICENSE]   (prompts when not given)
set -euo pipefail

CONVEX_SITE="$CONVEX_SITE_URL"
[ -n "$CONVEX_SITE" ] || CONVEX_SITE="${typeof window !== "undefined" ? window.location.origin : "https://lovable-dove-890.convex.site"}"

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
  echo "Connected - server $(echo "$RESPONSE" | sed -n 's/.*"code":"\\([^\"]*\\)\".*/\\1/p')"
  # >>> your app logic starts here <<<
else
  echo "License rejected: $(echo "$RESPONSE" | sed -n 's/.*"error":"\\([^\"]*\\)\".*/\\1/p')" >&2
  exit 1
fi`;

const kotlinCode = `// NameserverApi.kt — dependencies: implementation("com.squareup.okhttp3:okhttp:4.12.0")
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

object NameserverApi {
    private const val BASE_URL = "${SITE_URL}"
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
// val result = NameserverApi.connect("LIC-XXXX-XXXX-XXXX-XXXX-XXXX", "device-abc-123")`;

const udpCode = `// udp-handshake.mjs — stage 2 after a successful /connect
// The app calls librudp.createPipe(endpoint) → UDP handshake. This is a
// reliable-UDP pipe over a real UDP socket; run the relay on your own host
// (Convex serves HTTP only — it cannot listen on raw UDP). Adjust the packet
// layout below to match your binary's expectation.
import dgram from "node:dgram";

const CONVEX_SITE = "${SITE_URL}";

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
setTimeout(() => pipe.close(), 5000); // timeout guard`;

const endpoints = [
  {
    method: "POST",
    path: "/connect",
    auth: "public",
    desc: "Validate a license key. POST only (GET → 405). JSON body {\"license\"|\"key\", \"device\"|\"hwid\", \"game\"?} (primebit-style loaders send {\"key\", \"hwid\", \"game\"} — errors reply \"Invalid key\" / \"Key expired\" / \"Key banned\" / \"Device limit\" / \"Wrong Game Key\", success includes expires + the loader URL) — or the Havest-style form (game, version, user_key, serial, resource). Add \"action\": \"reset\" to unbind the device. Keys/devices are case-insensitive; 5 failed attempts/min/IP → 429",
    methodClass: "bg-emerald-600/90 text-white",
  },
  {
    method: "POST",
    path: "/api/login",
    auth: "public",
    desc: "Exchange { username, password } for { token, expiresAt } (24 h)",
    methodClass: "bg-emerald-600/90 text-white",
  },
  {
    method: "GET",
    path: "/api/files",
    auth: "Bearer",
    desc: "List uploaded files with metadata (size, sha256, download count)",
    methodClass: "bg-sky-600/90 text-white",
  },
  {
    method: "POST",
    path: "/api/files",
    auth: "Bearer",
    desc: "Upload a file — multipart fields: file, name?, version?, note?",
    methodClass: "bg-emerald-600/90 text-white",
  },
  {
    method: "GET",
    path: "/databases/:id",
    auth: "public",
    desc: "APK response URL — download a game loader (returned as data.url by /connect)",
    methodClass: "bg-sky-600/90 text-white",
  },
  {
    method: "DELETE",
    path: "/api/files/:id",
    auth: "Bearer",
    desc: "Delete a file and its bytes",
    methodClass: "bg-red-600/90 text-white",
  },
];

function CreateTokenCard() {
  const createApiToken = useMutation(api.files.createApiToken);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    token: string;
    expiresAt: number;
  } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await createApiToken({ label: label || undefined });
      setResult(res);
      setLabel("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create token");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Create an API token</CardTitle>
          <CardDescription>
            Tokens authenticate the REST API (
            <code className="rounded bg-muted px-1 py-0.5 text-xs">/api/files</code>
            and friends) via{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              Authorization: Bearer &lt;token&gt;
            </code>
            . The plaintext is shown exactly once.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="token-label">Label (optional)</Label>
              <Input
                id="token-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. my-python-bot"
                maxLength={60}
              />
            </div>
            <Button type="submit" disabled={busy} className="cursor-pointer">
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Create token
            </Button>
          </form>
        </CardContent>
      </Card>

      <Dialog open={result !== null} onOpenChange={(open) => !open && setResult(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>API token created</DialogTitle>
            <DialogDescription className="flex items-center gap-1.5">
              <AlertTriangle className="size-3.5 text-amber-500" />
              Shown once — copy it now. Expires{" "}
              {result ? formatDateTime(result.expiresAt) : "—"}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-3">
            <code className="min-w-0 flex-1 break-all font-mono text-xs">
              {result?.token}
            </code>
            <CopyButton value={result?.token ?? ""} label="Token" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TokenRow({ token }: { token: Doc<"apiTokens"> }) {
  const revokeApiToken = useMutation(api.files.revokeApiToken);
  const expired = token.expiresAt < Date.now();

  const revoke = async () => {
    try {
      await revokeApiToken({ id: token._id });
      toast.success("Token revoked — it can no longer authenticate");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke token");
    }
  };

  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">
            {token.label || "unlabeled"}
          </p>
          {expired ? (
            <Badge variant="secondary" className="text-muted-foreground">
              expired
            </Badge>
          ) : (
            <Badge className="bg-emerald-600/90 text-white hover:bg-emerald-600/90">
              active
            </Badge>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          created {formatDateTime(token.createdAt)} · expires{" "}
          {formatDateTime(token.expiresAt)}
        </p>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            size="icon-sm"
            className="cursor-pointer text-destructive"
            aria-label="Revoke token"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this token?</AlertDialogTitle>
            <AlertDialogDescription>
              Anything using it will immediately lose access to the API. The
              token is deleted permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="cursor-pointer bg-destructive text-white hover:bg-destructive/90"
              onClick={revoke}
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

export default function ApiTokens() {
  const tokens = useQuery(api.files.listApiTokens);

  if (tokens === undefined) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <PageHeader
        title="API & Tokens"
        description="Create API tokens and grab ready-to-use client libraries for your apps and scripts."
      />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.3 }}>
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Base URL & endpoints</CardTitle>
          <CardDescription>
            All routes are served from the Convex site URL. The connect
            endpoint is public; admin routes use a Bearer token.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-3 font-mono text-[12.5px]">
            <span className="truncate">{SITE_URL}</span>
            <CopyButton value={SITE_URL} label="URL" size="icon" />
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-3 py-2.5 font-medium">Method</th>
                  <th className="px-3 py-2.5 font-medium">Path</th>
                  <th className="px-3 py-2.5 font-medium">Auth</th>
                  <th className="px-3 py-2.5 font-medium">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {endpoints.map((ep) => (
                  <tr key={ep.method + ep.path} className="hover:bg-muted/30">
                    <td className="px-3 py-2.5">
                      <Badge className={ep.methodClass}>{ep.method}</Badge>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs">{ep.path}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {ep.auth}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {ep.desc}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>        </CardContent>
      </Card>
      </motion.div>

      <div className="space-y-4">

        <CreateTokenCard />

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">
              Tokens
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {tokens.length} total
              </span>
            </CardTitle>
            <CardDescription>
              Revoke a token any time to cut off whatever is using it.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {tokens.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <KeyRound className="size-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  No API tokens yet — create one above.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {tokens.map((token) => (
                  <TokenRow key={token._id} token={token} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            Client libraries
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Copy-paste ready. Replace{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              NS-XXXX-…
            </code>{" "}
            with a generated key — the server is detected from the key
            automatically. Each client asks the user for their license key and
            only proceeds when <code className="rounded bg-muted px-1 py-0.5 text-xs">ok: true</code>.
          </p>
        </div>

        <Card className="border-border/70">
          <CardContent className="pt-6">
            <Tabs defaultValue="nextjs">
              <TabsList>
                <TabsTrigger value="nextjs">Next.js</TabsTrigger>
                <TabsTrigger value="nodejs">Node.js</TabsTrigger>
                <TabsTrigger value="python">Python</TabsTrigger>
                <TabsTrigger value="shell">Shell (.sh)</TabsTrigger>
                <TabsTrigger value="kotlin">Android Kotlin</TabsTrigger>
              </TabsList>
              <TabsContent value="nextjs" className="mt-4">
                <CodeBlock code={nextjsCode} />
              </TabsContent>
              <TabsContent value="nodejs" className="mt-4">
                <CodeBlock code={nodejsCode} />
              </TabsContent>
              <TabsContent value="python" className="mt-4">
                <CodeBlock code={pythonCode} />
              </TabsContent>
              <TabsContent value="shell" className="mt-4">
                <CodeBlock code={shellCode} />
              </TabsContent>
              <TabsContent value="kotlin" className="mt-4">
                <CodeBlock code={kotlinCode} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">
            UDP handshake — librudp.createPipe(endpoint)
          </CardTitle>
          <CardDescription>
            After a successful connect, the app opens a reliable-UDP pipe and
            does a UDP handshake before starting the runtime. Convex serves
            HTTP only, so the UDP relay runs on your own host — the snippet
            below is the client side.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Flow:{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              POST /connect
            </code>{" "}
            (validate key, bind device) →{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              librudp.createPipe(endpoint)
            </code>{" "}
            → send handshake packet (license + device + timestamp) → relay
            re-validates and replies{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              {"{\"ok\":true}"}
            </code>{" "}
            → session starts. The endpoint is{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              udp://&lt;host&gt;:&lt;port&gt;
            </code>
            .
          </p>
          <CodeBlock code={udpCode} />
        </CardContent>
      </Card>
    </div>
  );
}
