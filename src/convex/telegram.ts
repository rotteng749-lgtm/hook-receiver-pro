/**
 * Telegram bot integration (owner-level).
 *
 * The bot is bound to a single Telegram chat (the owner). Only that chat can
 * run commands; every command performs owner-level operations through the
 * internal helpers in nameserver.ts (stats, servers, keys, key generation
 * from the owner's balance, maintenance toggle).
 *
 * Setup (from the panel at /owner/telegram):
 *   1. Open the bot in Telegram and send /id.
 *   2. Paste the returned chat id in the panel and press "Bind".
 *   3. The webhook is registered at /telegram/webhook automatically.
 *
 * Env (Convex dashboard → Settings → Environment Variables):
 *   TELEGRAM_BOT_TOKEN      — bot token (defaults to the project's token)
 *   TELEGRAM_OWNER_CHAT_ID  — optional pre-bound owner chat id
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  action,
  httpAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

const BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN ??
  "8613736980:AAH2bo-FA-GzsNngMNeLGRwkUKIF5HseUZA";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Telegram's setWebhook `secret_token` only allows A-Z a-z 0-9 _ and -
// (the bot token itself contains a colon, which is rejected). Strip
// everything else — the result is still derived from the secret token, and
// the webhook handler checks the same value.
const WEBHOOK_SECRET = BOT_TOKEN.replace(/[^A-Za-z0-9_-]/g, "");

const HELP_OWNER = [
  "Owner commands:",
  "- /stats — panel overview",
  "- /balance — your balance & key price",
  "- /servers — list servers",
  "- /keys — last 5 keys",
  "- /server <code> — server detail + recent connects",
  "- /genkey <code> [uses] [hours] — generate a key (from your balance)",
  "- /check <key> — key info (status, uses, device, id)",
  "- /resetkey <key> — unbind device (1 key = 1 device reset)",
  "- /export — JSON snapshot with ids (servers/keys/connections/members)",
  "- /maintenance on|off [message] — toggle maintenance",
  "- /tutorial — cara connect app/script dari awal sampai jalan",
  "- /id — your chat id",
].join("\n");

const HELP_ADMIN = [
  "Admin commands (bound by the owner in the panel → Telegram):",
  "- /keys — your last 5 keys",
  "- /servers — list servers",
  "- /check <key> — key info (your keys only)",
  "- /resetkey <key> — unbind device so the key can move to a new device (your keys only)",
  "- /tutorial — cara connect app/script dari awal sampai jalan",
  "- /id — your chat id",
  "",
  "Owner-only: /stats, /balance, /genkey, /server, /maintenance, /export",
].join("\n");

/** Step-by-step guide for hooking up an app / script (.sh, .dll, etc.) to
 *  the connect endpoint. Public — harmless info, so it is answered before
 *  the owner check. */
const TUTORIAL = [
  "📘 TUTORIAL — CARA CONNECT APP / SCRIPT",
  "",
  "1️⃣ Bikin server dulu (kalau belum ada):",
  "   Panel → Servers → New server (kode: eu-main, dll)",
  "   Cek daftarnya: /servers",
  "",
  "2️⃣ Generate key:",
  "   /genkey <kode> [uses] [jam]",
  "   Contoh: /genkey eu-main 3 24",
  "   → key: NS-XXXX-XXXX-XXXX-XXXX-XXXX",
  "",
  "3️⃣ Connect dari aplikasi (.sh, .dll, dll):",
  "   App tinggal minta user enter license key, lalu POST ke:",
  "   https://lovable-dove-890.convex.site/connect",
  "   Body JSON: {\"key\":\"NS-...\",\"device\":\"<device-id>\"}",
  "",
  "   Contoh .sh (taruh di awal script):",
  "   read -r -p \"License key: \" KEY",
  "   RESP=$(curl -sS -X POST https://lovable-dove-890.convex.site/connect \\",
  "     -H \"Content-Type: application/json\" \\",
  "     -d \"{\\\"key\\\":\\\"$KEY\\\"}\")",
  "   echo \"$RESP\" | grep -q '\"ok\":true' || { echo \"License rejected\"; exit 1; }",
  "",
  "   ok:true → lanjut jalan. ok:false → tampilkan error-nya.",
  "",
  "4️⃣ 1 key = 1 device:",
  "   Key ke-bind ke device pertama yang connect.",
  "   Mau pindah device? Reset dari device lama:",
  "   curl -X POST https://lovable-dove-890.convex.site/connect \\",
  "     -H \"Content-Type: application/json\" \\",
  "     -d '{\"key\":\"NS-...\",\"device\":\"device-lama\",\"action\":\"reset\"}'",
  "   atau minta owner reset dari panel → Keys.",
  "",
  "5️⃣ Client library lengkap (Node.js, Python, Kotlin, Next.js, .sh):",
  "   Panel → API & Tokens",
  "",
  "6️⃣ Pantau panel: /stats · /servers · /server <kode> · /keys",
].join("\n");

async function tgFetch(method: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`${TELEGRAM_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as {
    ok: boolean;
    result?: Record<string, unknown> & { username?: string };
    description?: string;
  };
}

async function sendMessage(chatId: string | number, text: string) {
  await tgFetch("sendMessage", { chat_id: chatId, text });
}

async function getSettings(ctx: QueryCtx | MutationCtx) {
  return await ctx.db
    .query("settings")
    .withIndex("by_scope", (q) => q.eq("scope", "global"))
    .first();
}

async function requireOwner(ctx: MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Not authenticated");
  const user = await ctx.db.get(userId);
  if (!user || user.role !== "owner") throw new Error("Forbidden");
}

/** Owner check for actions (no direct ctx.db — look the user up via a query). */
async function requireOwnerAction(ctx: ActionCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Not authenticated");
  const user = await ctx.runQuery(internal.telegram.getUserInternal, { userId });
  if (!user || user.role !== "owner") throw new Error("Forbidden");
}

function maskChatId(id: string): string {
  return id.length <= 6 ? id : `${id.slice(0, 3)}…${id.slice(-3)}`;
}

async function upsertSettings(
  ctx: MutationCtx,
  patch: {
    telegramOwnerChatId?: string | undefined;
    telegramBotUsername?: string | undefined;
    telegramAdmins?: { chatId: string; userId: Id<"users"> }[] | undefined;
  },
) {
  const doc = await getSettings(ctx);
  if (doc) {
    await ctx.db.patch(doc._id, patch);
  } else {
    await ctx.db.insert("settings", {
      scope: "global",
      keyPrice: 10,
      defaultKeyUses: 0,
      defaultKeyHours: 0,
      maintenance: false,
      downMessage: "",
      telegramOwnerChatId: patch.telegramOwnerChatId,
      telegramBotUsername: patch.telegramBotUsername,
      telegramAdmins: patch.telegramAdmins,
    });
  }
}

/* ------------------------------ panel API ------------------------------ */

export const status = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "owner") throw new Error("Forbidden");
    const settings = await getSettings(ctx);
    const admins = await Promise.all(
      (settings?.telegramAdmins ?? []).map(async (a) => {
        const u = await ctx.db.get(a.userId);
        return {
          userId: a.userId,
          chatId: a.chatId,
          maskedChatId: maskChatId(a.chatId),
          name: u?.name ?? u?.email ?? "unknown",
        };
      }),
    );
    return {
      botUsername: settings?.telegramBotUsername ?? null,
      ownerChatId: settings?.telegramOwnerChatId ?? null,
      maskedOwnerChatId: settings?.telegramOwnerChatId
        ? maskChatId(settings.telegramOwnerChatId)
        : null,
      envChatId: process.env.TELEGRAM_OWNER_CHAT_ID ?? null,
      admins,
    };
  },
});

/** Fetch the bot username from Telegram and cache it (for the panel link). */
export const refreshBotInfo = action({
  args: {},
  handler: async (ctx) => {
    await requireOwnerAction(ctx);
    const me = await tgFetch("getMe");
    if (!me.ok) throw new Error(me.description ?? "Invalid bot token");
    const username = me.result?.username ?? null;
    await ctx.runMutation(internal.telegram.upsertSettingsInternal, {
      telegramBotUsername: username ?? undefined,
    });
    return { botUsername: username };
  },
});

/** Bind a Telegram chat for an admin account (owner-only). Admins get a
 *  limited command set: /check and /resetkey on their own keys, /keys, /servers. */
export const addAdmin = mutation({
  args: { chatId: v.string(), userId: v.id("users") },
  handler: async (ctx, { chatId, userId }) => {
    await requireOwner(ctx);
    const cleaned = chatId.trim();
    if (!/^-?\d{5,}$/.test(cleaned)) {
      throw new Error("Invalid chat id — ask the admin to send /id to the bot");
    }
    const target = await ctx.db.get(userId);
    if (target === null) throw new Error("User not found");
    if (target.role !== "admin" && target.role !== "owner") {
      throw new Error("Only admin/owner accounts can be bound as bot admins");
    }
    const doc = await getSettings(ctx);
    const admins = (doc?.telegramAdmins ?? []).filter(
      (a) => a.chatId !== cleaned && a.userId !== userId,
    );
    admins.push({ chatId: cleaned, userId });
    if (doc) {
      await ctx.db.patch(doc._id, { telegramAdmins: admins });
    } else {
      await ctx.db.insert("settings", {
        scope: "global",
        keyPrice: 10,
        defaultKeyUses: 0,
        defaultKeyHours: 0,
        maintenance: false,
        downMessage: "",
        telegramAdmins: admins,
      });
    }
    return { chatId: cleaned, userId };
  },
});

/** Remove an admin's bound Telegram chat (owner-only). */
export const removeAdmin = mutation({
  args: { chatId: v.string() },
  handler: async (ctx, { chatId }) => {
    await requireOwner(ctx);
    const doc = await getSettings(ctx);
    if (doc?.telegramAdmins) {
      await ctx.db.patch(doc._id, {
        telegramAdmins: doc.telegramAdmins.filter((a) => a.chatId !== chatId),
      });
    }
    return { ok: true };
  },
});

/** Bind a Telegram chat as the owner-level controller and register the webhook. */
export const enable = action({
  args: { chatId: v.string() },
  handler: async (ctx, { chatId }) => {
    await requireOwnerAction(ctx);
    const cleaned = chatId.trim();
    if (!/^-?\d{5,}$/.test(cleaned)) {
      throw new Error("Invalid chat id — send /id to the bot and paste the number here");
    }
    const me = await tgFetch("getMe");
    if (!me.ok) throw new Error(me.description ?? "Invalid bot token");
    const username = me.result?.username ?? null;

    let webhookSet = false;
    const site = process.env.CONVEX_SITE_URL ?? "";
    if (site.length > 0) {
      const r = await tgFetch("setWebhook", {
        url: `${site}/telegram/webhook`,
        secret_token: WEBHOOK_SECRET,
        allowed_updates: ["message"],
      });
      if (!r.ok) {
        throw new Error(`Telegram setWebhook failed: ${r.description ?? "unknown"}`);
      }
      webhookSet = true;
    }

    await ctx.runMutation(internal.telegram.upsertSettingsInternal, {
      telegramOwnerChatId: cleaned,
      telegramBotUsername: username ?? undefined,
    });
    return { chatId: cleaned, botUsername: username, webhookSet };
  },
});

/** Unbind the bot (deletes the webhook and clears the bound chat). */
export const disable = action({
  args: {},
  handler: async (ctx) => {
    await requireOwnerAction(ctx);
    await tgFetch("deleteWebhook");
    await ctx.runMutation(internal.telegram.upsertSettingsInternal, {
      telegramOwnerChatId: undefined,
      telegramBotUsername: undefined,
    });
    return { ok: true };
  },
});

/* ------------------------------ webhook ------------------------------ */

export const getSettingsInternal = internalQuery({
  args: {},
  handler: async (ctx) => await getSettings(ctx),
});

export const getUserInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => await ctx.db.get(userId),
});

export const upsertSettingsInternal = internalMutation({
  args: {
    telegramOwnerChatId: v.optional(v.string()),
    telegramBotUsername: v.optional(v.string()),
    telegramAdmins: v.optional(
      v.array(v.object({ chatId: v.string(), userId: v.id("users") })),
    ),
  },
  handler: async (ctx, args) => {
    await upsertSettings(ctx, args);
  },
});

const webhook = httpAction(async (ctx, request) => {
  if (request.headers.get("x-telegram-bot-api-secret-token") !== WEBHOOK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  let update: {
    message?: { chat?: { id: number | string; type?: string }; text?: string };
  };
  try {
    update = (await request.json()) as typeof update;
  } catch {
    return new Response("bad request", { status: 400 });
  }
  const message = update?.message;
  if (!message || message.chat?.type !== "private") {
    return new Response("ok");
  }
  const chatId = String(message.chat.id);
  const text = (message.text ?? "").trim();

  const settings = await ctx.runQuery(internal.telegram.getSettingsInternal, {});
  const bound =
    settings?.telegramOwnerChatId ??
    process.env.TELEGRAM_OWNER_CHAT_ID ??
    null;
  const isOwner = bound !== null && chatId === String(bound);
  const adminEntry =
    (settings?.telegramAdmins ?? []).find((a) => a.chatId === chatId) ?? null;
  const isAdmin = adminEntry !== null;
  const reply = async (t: string): Promise<Response> => {
    await sendMessage(chatId, t);
    return new Response("ok");
  };
  const replyChunks = async (t: string, max = 3500): Promise<Response> => {
    for (let i = 0; i < t.length; i += max) {
      await sendMessage(chatId, t.slice(i, i + max));
    }
    return new Response("ok");
  };

  if (text === "/id") {
    return reply(`Your chat id:\n${chatId}`);
  }
  if (text === "/start" || text === "/help") {
    return reply(isAdmin && !isOwner ? HELP_ADMIN : HELP_OWNER);
  }
  if (text === "/tutorial" || text === "/cara") {
    return reply(TUTORIAL);
  }
  if (!isOwner && !isAdmin) {
    return reply("This bot is bound to the panel owner. Not authorized.");
  }

  const parts = text.split(/\s+/);
  const cmd = parts[0];

  if (cmd === "/stats") {
    const s = await ctx.runQuery(internal.nameserver.ownerStatsInternal, {});
    return reply(
      [
        "Panel overview",
        `Servers: ${s.serverCount}`,
        `Keys: ${s.keyCount} (${s.activeKeyCount} active)`,
        `Connects: ${s.connectCount} (${s.successCount} ok)`,
        `Members: ${s.memberCount}`,
        `Total balances: ${s.totalBalance}`,
        `Revenue: ${s.revenue}`,
        `Your balance: ${s.unlimited ? "∞ (unlimited)" : s.balance}`,
      ].join("\n"),
    );
  }

  if (cmd === "/balance") {
    const s = await ctx.runQuery(internal.nameserver.ownerStatsInternal, {});
    const price = settings?.keyPrice ?? 10;
    return reply(
      `Your balance: ${s.unlimited ? "∞ (unlimited)" : s.balance}\nKey price: ${price} per key`,
    );
  }

  if (cmd === "/servers") {
    const servers = await ctx.runQuery(internal.nameserver.listServersInternal, {});
    if (servers.length === 0) return reply("No servers yet.");
    return reply(
      servers
        .map((s) => `${s.status === "active" ? "ON" : "OFF"} ${s.name} (${s.code})`)
        .join("\n"),
    );
  }

  if (cmd === "/keys") {
    const keys = isOwner
      ? await ctx.runQuery(internal.nameserver.listKeysInternal, { limit: 5 })
      : await ctx.runQuery(internal.nameserver.listKeysByCreatorInternal, {
          userId: adminEntry!.userId,
          limit: 5,
        });
    const servers = await ctx.runQuery(internal.nameserver.listServersInternal, {});
    const byId = new Map(servers.map((s) => [s._id, s]));
    if (keys.length === 0)
      return reply(isOwner ? "No keys yet." : "You haven't generated any keys yet.");
    return reply(
      keys
        .map((k) => {
          const server = byId.get(k.serverId);
          const expires =
            k.expiresAt === 0 ? "never" : new Date(k.expiresAt).toISOString().slice(0, 10);
          const uses = `${k.uses}/${k.maxUses === 0 ? "unlimited" : k.maxUses}`;
          const device = k.deviceId ? `device ${k.deviceId}` : "not bound";
          return `${k.key}\n  ${server?.name ?? "?"} · ${k.status} · ${uses} · expires ${expires} · ${device}${k.note ? ` · ${k.note}` : ""}`;
        })
        .join("\n"),
    );
  }

  if (cmd === "/server") {
    const code = (parts[1] ?? "").toLowerCase();
    const servers = await ctx.runQuery(internal.nameserver.listServersInternal, {});
    const server = servers.find((s) => s.code === code);
    if (!server) return reply(`Server ${code} not found. Use /servers to list them.`);
    const conns = await ctx.runQuery(internal.nameserver.listConnectionsInternal, {
      limit: 8,
    });
    const recent = conns.filter((c) => c.serverId === server._id);
    return reply(
      [
        `${server.status === "active" ? "ON" : "OFF"} ${server.name} (${server.code})`,
        server.description ?? "",
        `Recent connects: ${recent.length === 0 ? "none yet" : recent.map((c) => (c.ok ? "OK" : "FAIL")).join(" ")}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  if (cmd === "/genkey") {
    const code = (parts[1] ?? "").toLowerCase();
    if (!code) {
      return reply("Usage: /genkey <code> [uses] [hours]\nExample: /genkey eu-main 3 24");
    }
    const uses = parts[2] !== undefined ? Number(parts[2]) : undefined;
    const hours = parts[3] !== undefined ? Number(parts[3]) : undefined;
    try {
      const r = await ctx.runMutation(internal.nameserver.genKeyAsOwner, {
        serverCode: code,
        uses: uses !== undefined && Number.isFinite(uses) ? uses : undefined,
        hours: hours !== undefined && Number.isFinite(hours) ? hours : undefined,
      });
      const expires =
        r.expiresAt > 0 ? new Date(r.expiresAt).toISOString().slice(0, 10) : "never";
      return reply(
        [
          `Key generated for ${r.serverName} (${r.serverCode})`,
          r.key,
          `Cost: ${r.cost} · Remaining balance: ${r.unlimited ? "∞ (unlimited)" : r.balance}`,
          `Uses: ${r.maxUses > 0 ? r.maxUses : "unlimited"}`,
          `Expires: ${expires}`,
        ].join("\n"),
      );
    } catch (err) {
      return reply(err instanceof Error ? err.message : "Failed to generate key");
    }
  }

  if (cmd === "/check") {
    const key = (parts[1] ?? "").trim();
    if (!key) return reply("Usage: /check <key>");
    const r = await ctx.runQuery(internal.nameserver.getKeyByValue, { key });
    if (r === null) return reply("Key not found.");
    if (!isOwner && r.createdBy !== adminEntry!.userId) {
      return reply("Key not found (you can only check keys you created).");
    }
    const servers = await ctx.runQuery(internal.nameserver.listServersInternal, {});
    const server = servers.find((s) => s._id === r.serverId);
    const creator = await ctx.runQuery(internal.telegram.getUserInternal, {
      userId: r.createdBy,
    });
    const expires =
      r.expiresAt === 0 ? "never" : new Date(r.expiresAt).toISOString().slice(0, 10);
    return reply(
      [
        `Key: ${r.key}`,
        `ID: ${r._id}`,
        `Server: ${server?.name ?? "?"} (${server?.code ?? "?"})`,
        `Status: ${r.status}`,
        `Uses: ${r.uses}/${r.maxUses === 0 ? "unlimited" : r.maxUses}`,
        `Expires: ${expires}`,
        `Device: ${r.deviceId ? r.deviceId : "not bound"}`,
        `Creator: ${creator?.name ?? creator?.email ?? r.createdBy}`,
        `Cost: ${r.cost}`,
        r.note ? `Note: ${r.note}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  if (cmd === "/resetkey") {
    const key = (parts[1] ?? "").trim();
    if (!key) {
      return reply(
        "Usage: /resetkey <key>\nUnbinds the device so the key can connect from a new device (1 key = 1 device).",
      );
    }
    try {
      const r = await ctx.runMutation(internal.nameserver.resetKeyByValueInternal, {
        key,
        actorUserId: isOwner ? undefined : adminEntry!.userId,
      });
      return reply(
        r.hadDevice
          ? `Device unbound for ${r.key} — it can now connect from a new device.`
          : `${r.key} was not bound to a device.`,
      );
    } catch (err) {
      return reply(err instanceof Error ? err.message : "Failed to reset key");
    }
  }

  if (cmd === "/export") {
    if (!isOwner) return reply("Owner-only command.");
    const snap = await ctx.runQuery(internal.nameserver.exportSnapshotInternal, {});
    const json = JSON.stringify(
      {
        generatedAt: new Date(snap.generatedAt).toISOString(),
        servers: snap.servers.map((s) => ({
          _id: s._id,
          name: s.name,
          code: s.code,
          status: s.status,
        })),
        keys: snap.keys.map((k) => ({
          _id: k._id,
          key: k.key,
          serverId: k.serverId,
          createdBy: k.createdBy,
          status: k.status,
          uses: k.uses,
          maxUses: k.maxUses,
          expiresAt: k.expiresAt,
          deviceId: k.deviceId ?? null,
          note: k.note ?? null,
        })),
        connections: snap.connections.map((c) => ({
          _id: c._id,
          key: c.key,
          serverId: c.serverId ?? null,
          keyId: c.keyId ?? null,
          ok: c.ok,
          reason: c.reason ?? null,
          deviceId: c.deviceId ?? null,
          game: c.game ?? null,
          version: c.version ?? null,
          resource: c.resource ?? null,
          ip: c.ip,
          time: c._creationTime,
        })),
        members: snap.members,
      },
      null,
      2,
    );
    return replyChunks(json);
  }

  if (cmd === "/maintenance") {
    const on = parts[1]?.toLowerCase();
    if (on !== "on" && on !== "off") {
      return reply("Usage: /maintenance on|off [message]");
    }
    const message = parts.slice(2).join(" ");
    await ctx.runMutation(internal.nameserver.setMaintenanceInternal, {
      on: on === "on",
      message: on === "on" ? message || undefined : undefined,
    });
    return reply(
      on === "on"
        ? "Maintenance ON — connects are now blocked."
        : "Maintenance OFF — connects allowed.",
    );
  }

  return reply(HELP_OWNER);
});

export { webhook };
