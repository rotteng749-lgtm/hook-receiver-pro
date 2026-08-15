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
  query,
} from "./_generated/server";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";

const BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN ??
  "8613736980:AAH2bo-FA-GzsNngMNeLGRwkUKIF5HseUZA";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const HELP_OWNER = [
  "Owner commands:",
  "- /stats — panel overview",
  "- /balance — your balance & key price",
  "- /servers — list servers",
  "- /keys — last 5 keys",
  "- /server <code> — server detail + recent connects",
  "- /genkey <code> [uses] [hours] — generate a key (from your balance)",
  "- /maintenance on|off [message] — toggle maintenance",
  "- /id — your chat id",
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
    return {
      botUsername: settings?.telegramBotUsername ?? null,
      ownerChatId: settings?.telegramOwnerChatId ?? null,
      maskedOwnerChatId: settings?.telegramOwnerChatId
        ? maskChatId(settings.telegramOwnerChatId)
        : null,
      envChatId: process.env.TELEGRAM_OWNER_CHAT_ID ?? null,
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
        secret_token: BOT_TOKEN,
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
  },
  handler: async (ctx, args) => {
    await upsertSettings(ctx, args);
  },
});

const webhook = httpAction(async (ctx, request) => {
  if (request.headers.get("x-telegram-bot-api-secret-token") !== BOT_TOKEN) {
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
  const reply = async (t: string): Promise<Response> => {
    await sendMessage(chatId, t);
    return new Response("ok");
  };

  if (text === "/id") {
    return reply(`Your chat id:\n${chatId}`);
  }
  if (text === "/start" || text === "/help") {
    return reply(HELP_OWNER);
  }
  if (!isOwner) {
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
    const keys = await ctx.runQuery(internal.nameserver.listKeysInternal, { limit: 5 });
    const servers = await ctx.runQuery(internal.nameserver.listServersInternal, {});
    const byId = new Map(servers.map((s) => [s._id, s]));
    if (keys.length === 0) return reply("No keys yet.");
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
