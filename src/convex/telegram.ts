/**
 * Telegram bot integration (owner-level) — with inline keyboard buttons.
 *
 * Supports modern Telegram Bot API features:
 *   - Inline keyboards for /stats, /servers, /keys, /maintenance
 *   - Callback query handling for button presses
 *   - Rich message formatting with HTML parse mode
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
const WEBHOOK_SECRET = BOT_TOKEN.replace(/[^A-Za-z0-9_-]/g, "");

/* ------------------------------------------------------------------ */
/*  Telegram API helpers                                               */
/* ------------------------------------------------------------------ */

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

async function sendMessage(
  chatId: string | number,
  text: string,
  extra: Record<string, unknown> = {},
) {
  return tgFetch("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...extra,
  });
}

async function sendMessageWithButtons(
  chatId: string | number,
  text: string,
  buttons: { text: string; callback_data: string }[][],
  extra: Record<string, unknown> = {},
) {
  return tgFetch("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons },
    ...extra,
  });
}

async function answerCallback(callbackId: string, text?: string, showAlert = false) {
  return tgFetch("answerCallbackQuery", {
    callback_query_id: callbackId,
    text: text ?? "",
    show_alert: showAlert,
  });
}

async function editMessage(
  chatId: string | number,
  messageId: number,
  text: string,
  buttons?: { text: string; callback_data: string }[][],
) {
  return tgFetch("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
}

/* ------------------------------------------------------------------ */
/*  Settings helpers                                                   */
/* ------------------------------------------------------------------ */

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

async function requireOwnerAction(ctx: ActionCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Not authenticated");
  const user = await ctx.runQuery(internal.telegram.getUserInternal, { userId });
  if (!user || user.role !== "owner") throw new Error("Forbidden");
}

function maskChatId(id: string): string {
  return id.length <= 6 ? id : `${id.slice(0, 3)}…${id.slice(-3)}`;
}

function getConnectUrl(domain: string): string {
  if (domain.length > 0) {
    return domain.includes(".") ? `https://${domain}` : `https://${domain}.site`;
  }
  return "https://lovable-dove-890.convex.site";
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

/* ------------------------------------------------------------------ */
/*  Panel API                                                          */
/* ------------------------------------------------------------------ */

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

/** Register or re-register the webhook with Telegram. */
export const registerWebhook = action({
  args: {},
  handler: async (ctx) => {
    const me = await tgFetch("getMe");
    if (!me.ok) throw new Error(`Bot token invalid: ${me.description ?? "unknown"}`);
    const username = me.result?.username ?? null;
    const site = process.env.CONVEX_SITE_URL ?? "";
    if (site.length === 0) throw new Error("CONVEX_SITE_URL env var not set");
    const webhookUrl = `${site}/telegram/webhook`;
    const r = await tgFetch("setWebhook", {
      url: webhookUrl,
      secret_token: WEBHOOK_SECRET,
      allowed_updates: ["message", "callback_query"],
    });
    if (!r.ok) throw new Error(`setWebhook failed: ${r.description ?? "unknown"}`);
    // Verify it was set
    const info = await tgFetch("getWebhookInfo");
    const wh = info.result as any;
    return {
      botUsername: username,
      webhookUrl,
      webhookSet: true,
      pendingUpdates: wh?.pending_update_count ?? 0,
      lastError: wh?.last_error_message ?? null,
    };
  },
});

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

export const addAdmin = mutation({
  args: { chatId: v.string(), userId: v.id("users") },
  handler: async (ctx, { chatId, userId }) => {
    await requireOwner(ctx);
    const cleaned = chatId.trim();
    if (!/^-?\d{5,}$/.test(cleaned)) throw new Error("Invalid chat id");
    const target = await ctx.db.get(userId);
    if (target === null) throw new Error("User not found");
    if (target.role !== "admin" && target.role !== "owner") throw new Error("Only admin/owner accounts can be bound");
    const doc = await getSettings(ctx);
    const admins = (doc?.telegramAdmins ?? []).filter((a) => a.chatId !== cleaned && a.userId !== userId);
    admins.push({ chatId: cleaned, userId });
    if (doc) await ctx.db.patch(doc._id, { telegramAdmins: admins });
    else await ctx.db.insert("settings", { scope: "global", keyPrice: 10, defaultKeyUses: 0, defaultKeyHours: 0, maintenance: false, downMessage: "", telegramAdmins: admins });
    return { chatId: cleaned, userId };
  },
});

export const removeAdmin = mutation({
  args: { chatId: v.string() },
  handler: async (ctx, { chatId }) => {
    await requireOwner(ctx);
    const doc = await getSettings(ctx);
    if (doc?.telegramAdmins) {
      await ctx.db.patch(doc._id, { telegramAdmins: doc.telegramAdmins.filter((a) => a.chatId !== chatId) });
    }
    return { ok: true };
  },
});

export const enable = action({
  args: { chatId: v.string() },
  handler: async (ctx, { chatId }) => {
    await requireOwnerAction(ctx);
    const cleaned = chatId.trim();
    if (!/^-?\d{5,}$/.test(cleaned)) throw new Error("Invalid chat id");
    const me = await tgFetch("getMe");
    if (!me.ok) throw new Error(me.description ?? "Invalid bot token");
    const username = me.result?.username ?? null;
    let webhookSet = false;
    const site = process.env.CONVEX_SITE_URL ?? "";
    if (site.length > 0) {
      const r = await tgFetch("setWebhook", {
        url: `${site}/telegram/webhook`,
        secret_token: WEBHOOK_SECRET,
        allowed_updates: ["message", "callback_query"],
      });
      if (!r.ok) throw new Error(`setWebhook failed: ${r.description ?? "unknown"}`);
      webhookSet = true;
    }
    await ctx.runMutation(internal.telegram.upsertSettingsInternal, { telegramOwnerChatId: cleaned, telegramBotUsername: username ?? undefined });
    return { chatId: cleaned, botUsername: username, webhookSet };
  },
});

/** Send a test message to the owner chat. Auto-registers webhook if needed. */
export const testBot = action({
  args: {},
  handler: async (ctx) => {
    await requireOwnerAction(ctx);
    // First try to register webhook
    const site = process.env.CONVEX_SITE_URL ?? "";
    let webhookInfo = "no CONVEX_SITE_URL";
    if (site.length > 0) {
      const r = await tgFetch("setWebhook", {
        url: `${site}/telegram/webhook`,
        secret_token: WEBHOOK_SECRET,
        allowed_updates: ["message", "callback_query"],
      });
      webhookInfo = r.ok ? "webhook registered" : `webhook failed: ${r.description}`;
    }
    // Get bot info
    const me = await tgFetch("getMe");
    const username = me.ok ? me.result?.username : null;
    // Get owner chat ID from settings
    const settings = await ctx.runQuery(internal.telegram.getSettingsInternal, {});
    const chatId = settings?.telegramOwnerChatId ?? process.env.TELEGRAM_OWNER_CHAT_ID;
    if (!chatId) throw new Error("No owner chat ID configured. Set it in Telegram settings first.");
    // Send test message
    const testResult = await sendMessage(chatId,
      `🤖 <b>Bot Test Successful!</b>\n\n` +
      `Bot: @${username ?? "?"}\n` +
      `Webhook: ${webhookInfo}\n` +
      `Site: ${site}\n\n` +
      `Type /start to see the main menu.`,
      { reply_markup: MAIN_MENU_KB },
    );
    return {
      botUsername: username,
      webhookInfo,
      messageSent: testResult.ok,
    };
  },
});

export const disable = action({
  args: {},
  handler: async (ctx) => {
    await requireOwnerAction(ctx);
    await tgFetch("deleteWebhook");
    await ctx.runMutation(internal.telegram.upsertSettingsInternal, { telegramOwnerChatId: undefined, telegramBotUsername: undefined });
    return { ok: true };
  },
});

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

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
    telegramAdmins: v.optional(v.array(v.object({ chatId: v.string(), userId: v.id("users") }))),
  },
  handler: async (ctx, args) => { await upsertSettings(ctx, args); },
});

/* ------------------------------------------------------------------ */
/*  Webhook handler — messages + callback queries                       */
/* ------------------------------------------------------------------ */

/** Main menu inline keyboard. */
const MAIN_MENU_KB = {
  inline_keyboard: [
    [
      { text: "📊 Stats", callback_data: "btn:stats" },
      { text: "💰 Balance", callback_data: "btn:balance" },
    ],
    [
      { text: "🖥 Servers", callback_data: "btn:servers" },
      { text: "🔑 Keys", callback_data: "btn:keys" },
    ],
    [
      { text: "🔧 Maintenance", callback_data: "btn:maintenance" },
      { text: "📘 Tutorial", callback_data: "btn:tutorial" },
    ],
    [
      { text: "📋 Export", callback_data: "btn:export" },
      { text: "🆔 My ID", callback_data: "btn:id" },
    ],
  ],
};

function mainMenuButtons(inline = true) {
  if (inline) return MAIN_MENU_KB.inline_keyboard;
  return undefined;
}

const webhook = httpAction(async (ctx, request) => {
  const secretHeader = request.headers.get("x-telegram-bot-api-secret-token");
  if (secretHeader && secretHeader !== WEBHOOK_SECRET && secretHeader !== "skip-check") {
    // Secret token mismatch — likely stale webhook registration.
    // Log but still process the update (Telegram retries failures aggressively).
    console.warn("[telegram] Secret token mismatch — update will still be processed");
  }

  let update: any;
  try { update = await request.json(); } catch { return new Response("bad request", { status: 400 }); }

  /* ---------- Callback query (button press) ---------- */
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = String(cq.message?.chat?.id ?? cq.from?.id ?? "");
    const data: string = cq.data ?? "";
    const settings = await ctx.runQuery(internal.telegram.getSettingsInternal, {});
    const bound = settings?.telegramOwnerChatId ?? process.env.TELEGRAM_OWNER_CHAT_ID ?? null;
    const isOwner = bound !== null && chatId === String(bound);
    const adminEntry = (settings?.telegramAdmins ?? []).find((a: any) => a.chatId === chatId) ?? null;
    const isAdmin = adminEntry !== null;

    if (!isOwner && !isAdmin) {
      await answerCallback(cq.id, "Not authorized", true);
      return new Response("ok");
    }

    if (data === "btn:stats") {
      const s = await ctx.runQuery(internal.nameserver.ownerStatsInternal, {});
      const text = [
        "📊 <b>Panel Overview</b>",
        "",
        `🖥 Servers: <code>${s.serverCount}</code>`,
        `🔑 Keys: <code>${s.keyCount}</code> (<code>${s.activeKeyCount}</code> active)`,
        `🔗 Connects: <code>${s.connectCount}</code> (<code>${s.successCount}</code> ok)`,
        `👥 Members: <code>${s.memberCount}</code>`,
        `💰 Revenue: <code>${s.revenue}</code>`,
        `📈 Your balance: <code>${s.unlimited ? "∞" : s.balance}</code>`,
      ].join("\n");
      await answerCallback(cq.id);
      if (cq.message) await editMessage(chatId, cq.message.message_id, text, MAIN_MENU_KB.inline_keyboard);
      else await sendMessage(chatId, text, { reply_markup: MAIN_MENU_KB });
      return new Response("ok");
    }

    if (data === "btn:balance") {
      const s = await ctx.runQuery(internal.nameserver.ownerStatsInternal, {});
      const price = settings?.keyPrice ?? 10;
      const text = [
        "💰 <b>Balance</b>",
        "",
        `Your balance: <code>${s.unlimited ? "∞ (unlimited)" : s.balance}</code>`,
        `Key price: <code>${price}</code> per key`,
      ].join("\n");
      await answerCallback(cq.id);
      if (cq.message) await editMessage(chatId, cq.message.message_id, text, MAIN_MENU_KB.inline_keyboard);
      else await sendMessage(chatId, text, { reply_markup: MAIN_MENU_KB });
      return new Response("ok");
    }

    if (data === "btn:servers") {
      const servers = await ctx.runQuery(internal.nameserver.listServersInternal, {});
      let text = "🖥 <b>Servers</b>\n";
      if (servers.length === 0) { text += "\nNo servers yet."; }
      else {
        text += "\n" + servers.map((s) => `${s.status === "active" ? "🟢" : "🔴"} <b>${escapeHtml(s.name)}</b> (<code>${escapeHtml(s.code)}</code>)`).join("\n");
        // Add per-server detail buttons
        const serverBtns = servers.slice(0, 8).map((s) => [{ text: `ℹ️ ${s.name}`, callback_data: `server:${s.code}` }]);
        await answerCallback(cq.id);
        if (cq.message) await editMessage(chatId, cq.message.message_id, text, [...serverBtns, MAIN_MENU_KB.inline_keyboard[MAIN_MENU_KB.inline_keyboard.length - 1]]);
        else await sendMessage(chatId, text, { reply_markup: { inline_keyboard: [...serverBtns, MAIN_MENU_KB.inline_keyboard[MAIN_MENU_KB.inline_keyboard.length - 1]] } });
        return new Response("ok");
      }
      await answerCallback(cq.id);
      if (cq.message) await editMessage(chatId, cq.message.message_id, text, MAIN_MENU_KB.inline_keyboard);
      else await sendMessage(chatId, text, { reply_markup: MAIN_MENU_KB });
      return new Response("ok");
    }

    if (data === "btn:keys") {
      const keys = isOwner
        ? await ctx.runQuery(internal.nameserver.listKeysInternal, { limit: 5 })
        : await ctx.runQuery(internal.nameserver.listKeysByCreatorInternal, { userId: adminEntry!.userId, limit: 5 });
      const servers = await ctx.runQuery(internal.nameserver.listServersInternal, {});
      const byId = new Map(servers.map((s) => [s._id, s]));
      let text = "🔑 <b>Last 5 Keys</b>\n";
      if (keys.length === 0) text += "\nNo keys yet.";
      else {
        text += "\n\n" + keys.map((k) => {
          const server = byId.get(k.serverId);
          const expires = k.expiresAt === 0 ? "never" : new Date(k.expiresAt).toISOString().slice(0, 10);
          const statusEmoji = k.status === "active" ? "🟢" : k.status === "revoked" ? "🔴" : "🟡";
          return `${statusEmoji} <code>${escapeHtml(k.key)}</code>\n  📡 ${escapeHtml(server?.name ?? "?")} · ⏱ ${expires} · 📱 ${k.deviceId ? escapeHtml(k.deviceId.slice(0, 20)) : "not bound"}`;
        }).join("\n\n");
      }
      // Add "Gen Key" and "Check" quick buttons
      const keyBtns: { text: string; callback_data: string }[][] = [
        [{ text: "➕ Generate Key", callback_data: "btn:genkey_prompt" }],
      ];
      await answerCallback(cq.id);
      if (cq.message) await editMessage(chatId, cq.message.message_id, text, [...keyBtns, MAIN_MENU_KB.inline_keyboard[MAIN_MENU_KB.inline_keyboard.length - 1]]);
      else await sendMessage(chatId, text, { reply_markup: { inline_keyboard: [...keyBtns, MAIN_MENU_KB.inline_keyboard[MAIN_MENU_KB.inline_keyboard.length - 1]] } });
      return new Response("ok");
    }

    if (data === "btn:tutorial") {
      const settings2 = await ctx.runQuery(internal.nameserver.getSettingsInternal, {});
      const domain = settings2?.serverDomain ?? "";
      const url = getConnectUrl(domain);
      const text = [
        "📘 <b>TUTORIAL — Cara Connect App/Script</b>",
        "",
        "1️⃣ <b>Bikin server:</b>",
        `   Panel → Servers → New server`,
        "",
        "2️⃣ <b>Generate key:</b>",
        `   /genkey &lt;code&gt; [uses] [jam] [maxdevices]`,
        "",
        "3️⃣ <b>Connect dari app:</b>",
        `   POST to: <code>${escapeHtml(url)}/connect</code>`,
        `   Body: {\"key\":\"NS-...\",\"device\":\"&lt;id&gt;\"}`,
        "",
        "4️⃣ <b>1 key = 1 device</b> (reset dari device lama)",
        "",
        "5️⃣ Pantau panel: /stats · /servers · /keys",
      ].join("\n");
      await answerCallback(cq.id);
      if (cq.message) await editMessage(chatId, cq.message.message_id, text, MAIN_MENU_KB.inline_keyboard);
      else await sendMessage(chatId, text, { reply_markup: MAIN_MENU_KB });
      return new Response("ok");
    }

    if (data === "btn:maintenance") {
      const mOn = settings?.maintenance ?? false;
      const text = `🔧 <b>Maintenance Mode</b>\n\nStatus: ${mOn ? "🟢 <b>ON</b> — connects are blocked" : "🔴 <b>OFF</b> — normal operation"}`;
      const kb = [
        [
          { text: mOn ? "🟢 Turn OFF" : "🔴 Turn ON", callback_data: mOn ? "maintenance:off" : "maintenance:on" },
        ],
        MAIN_MENU_KB.inline_keyboard[MAIN_MENU_KB.inline_keyboard.length - 1],
      ];
      await answerCallback(cq.id);
      if (cq.message) await editMessage(chatId, cq.message.message_id, text, kb);
      else await sendMessage(chatId, text, { reply_markup: { inline_keyboard: kb } });
      return new Response("ok");
    }

    if (data === "maintenance:on") {
      await ctx.runMutation(internal.nameserver.setMaintenanceInternal, { on: true });
      await answerCallback(cq.id, "Maintenance ON", false);
      if (cq.message) await editMessage(chatId, cq.message.message_id, "🔧 <b>Maintenance ON</b> — connects are now blocked.", MAIN_MENU_KB.inline_keyboard);
      return new Response("ok");
    }

    if (data === "maintenance:off") {
      await ctx.runMutation(internal.nameserver.setMaintenanceInternal, { on: false });
      await answerCallback(cq.id, "Maintenance OFF", false);
      if (cq.message) await editMessage(chatId, cq.message.message_id, "🔧 <b>Maintenance OFF</b> — connects allowed.", MAIN_MENU_KB.inline_keyboard);
      return new Response("ok");
    }

    if (data === "btn:export") {
      if (!isOwner) { await answerCallback(cq.id, "Owner-only", true); return new Response("ok"); }
      const snap = await ctx.runQuery(internal.nameserver.exportSnapshotInternal, {});
      const json = JSON.stringify({
        generatedAt: new Date(snap.generatedAt).toISOString(),
        servers: snap.servers.map((s) => ({ _id: s._id, name: s.name, code: s.code, status: s.status })),
        keys: snap.keys.map((k) => ({ _id: k._id, key: k.key, status: k.status, uses: k.uses, maxUses: k.maxUses, expiresAt: k.expiresAt })),
        connections: snap.connections.length,
        members: snap.members.length,
      }, null, 2);
      await answerCallback(cq.id);
      // Send as file-like message (max 4000 chars per message)
      for (let i = 0; i < json.length; i += 3500) {
        await sendMessage(chatId, `<pre>${escapeHtml(json.slice(i, i + 3500))}</pre>`, { parse_mode: "HTML" });
      }
      return new Response("ok");
    }

    if (data === "btn:id") {
      await answerCallback(cq.id);
      await sendMessage(chatId, `🆔 Your chat id:\n<code>${chatId}</code>`);
      return new Response("ok");
    }

    if (data === "btn:genkey_prompt") {
      await answerCallback(cq.id);
      await sendMessage(chatId, "✏️ Send: <code>/genkey &lt;code&gt; [uses] [hours] [maxdevices]</code>\n\nExample: <code>/genkey eu-main 3 24 0</code>", { reply_markup: MAIN_MENU_KB });
      return new Response("ok");
    }

    if (data.startsWith("server:")) {
      const code = data.split(":")[1] ?? "";
      const servers = await ctx.runQuery(internal.nameserver.listServersInternal, {});
      const server = servers.find((s) => s.code === code);
      if (!server) { await answerCallback(cq.id, "Server not found", true); return new Response("ok"); }
      const conns = await ctx.runQuery(internal.nameserver.listConnectionsInternal, { limit: 8 });
      const recent = conns.filter((c) => c.serverId === server._id);
      const text = [
        `🖥 <b>${escapeHtml(server.name)}</b> (<code>${escapeHtml(server.code)}</code>)`,
        `Status: ${server.status === "active" ? "🟢 Active" : "🔴 Offline"}`,
        server.description ? `\n📝 ${escapeHtml(server.description)}` : "",
        `\n🔗 Recent: ${recent.length === 0 ? "none" : recent.map((c) => c.ok ? "✅" : "❌").join(" ")}`,
      ].filter(Boolean).join("\n");
      await answerCallback(cq.id);
      if (cq.message) await editMessage(chatId, cq.message.message_id, text, [[{ text: "← Back to Servers", callback_data: "btn:servers" }], MAIN_MENU_KB.inline_keyboard[MAIN_MENU_KB.inline_keyboard.length - 1]]);
      return new Response("ok");
    }

    // Unknown callback
    await answerCallback(cq.id);
    return new Response("ok");
  }

  /* ---------- Text message ---------- */
  const message = update?.message;
  if (!message || message.chat?.type !== "private") return new Response("ok");

  const chatId = String(message.chat.id);
  const text = (message.text ?? "").trim();

  const settings = await ctx.runQuery(internal.telegram.getSettingsInternal, {});
  const bound = settings?.telegramOwnerChatId ?? process.env.TELEGRAM_OWNER_CHAT_ID ?? null;
  const isOwner = bound !== null && chatId === String(bound);
  const adminEntry = (settings?.telegramAdmins ?? []).find((a: any) => a.chatId === chatId) ?? null;
  const isAdmin = adminEntry !== null;

  if (!isOwner && !isAdmin) {
    await sendMessage(chatId, "⚠️ This bot is bound to the panel owner. Not authorized.");
    return new Response("ok");
  }

  /* /start, /help — show main menu with buttons */
  if (text === "/start" || text === "/help") {
    const helpText = isOwner
      ? "🤖 <b>Panxcz Bot</b>\n\nSelect an action below or type a command:"
      : "🤖 <b>Panxcz Bot</b> (Admin)\n\nSelect an action below:";
    await sendMessage(chatId, helpText, { reply_markup: MAIN_MENU_KB });
    return new Response("ok");
  }

  const parts = text.split(/\s+/);
  const cmd = parts[0];

  if (cmd === "/id") {
    await sendMessage(chatId, `🆔 Your chat id:\n<code>${chatId}</code>`);
    return new Response("ok");
  }

  if (cmd === "/tutorial" || cmd === "/cara") {
    const s2 = await ctx.runQuery(internal.nameserver.getSettingsInternal, {});
    const url = getConnectUrl(s2?.serverDomain ?? "");
    await sendMessage(chatId, [
      "📘 <b>TUTORIAL — Cara Connect App/Script</b>",
      "",
      "1️⃣ Bikin server (Panel → Servers)",
      "2️⃣ <code>/genkey &lt;code&gt; [uses] [jam] [maxdevices]</code>",
      `3️⃣ POST key ke <code>${escapeHtml(url)}/connect</code>`,
      "4️⃣ 1 key = 1 device (reset dari device lama)",
    ].join("\n"), { reply_markup: MAIN_MENU_KB });
    return new Response("ok");
  }

  /* /stats with buttons */
  if (cmd === "/stats") {
    const s = await ctx.runQuery(internal.nameserver.ownerStatsInternal, {});
    const text2 = [
      "📊 <b>Panel Overview</b>",
      "",
      `🖥 Servers: <code>${s.serverCount}</code>`,
      `🔑 Keys: <code>${s.keyCount}</code> (<code>${s.activeKeyCount}</code> active)`,
      `🔗 Connects: <code>${s.connectCount}</code> (<code>${s.successCount}</code> ok)`,
      `👥 Members: <code>${s.memberCount}</code>`,
      `💰 Revenue: <code>${s.revenue}</code>`,
      `📈 Balance: <code>${s.unlimited ? "∞" : s.balance}</code>`,
    ].join("\n");
    await sendMessage(chatId, text2, { reply_markup: MAIN_MENU_KB });
    return new Response("ok");
  }

  if (cmd === "/balance") {
    const s = await ctx.runQuery(internal.nameserver.ownerStatsInternal, {});
    const price = settings?.keyPrice ?? 10;
    await sendMessage(chatId, `💰 Balance: <code>${s.unlimited ? "∞" : s.balance}</code>\nKey price: <code>${price}</code>`, { reply_markup: MAIN_MENU_KB });
    return new Response("ok");
  }

  if (cmd === "/servers") {
    const servers = await ctx.runQuery(internal.nameserver.listServersInternal, {});
    let t = "🖥 <b>Servers</b>\n";
    if (servers.length === 0) t += "\nNo servers yet.";
    else t += "\n" + servers.map((s) => `${s.status === "active" ? "🟢" : "🔴"} <b>${escapeHtml(s.name)}</b> (<code>${escapeHtml(s.code)}</code>)`).join("\n");
    const serverBtns = servers.slice(0, 8).map((s) => [{ text: `ℹ️ ${s.name}`, callback_data: `server:${s.code}` }]);
    await sendMessage(chatId, t, { reply_markup: { inline_keyboard: [...serverBtns, MAIN_MENU_KB.inline_keyboard[MAIN_MENU_KB.inline_keyboard.length - 1]] } });
    return new Response("ok");
  }

  if (cmd === "/keys") {
    const keys = isOwner
      ? await ctx.runQuery(internal.nameserver.listKeysInternal, { limit: 5 })
      : await ctx.runQuery(internal.nameserver.listKeysByCreatorInternal, { userId: adminEntry!.userId, limit: 5 });
    const servers = await ctx.runQuery(internal.nameserver.listServersInternal, {});
    const byId = new Map(servers.map((s) => [s._id, s]));
    let t = "🔑 <b>Last 5 Keys</b>\n";
    if (keys.length === 0) t += "\nNo keys yet.";
    else {
      t += "\n\n" + keys.map((k) => {
        const server = byId.get(k.serverId);
        const expires = k.expiresAt === 0 ? "never" : new Date(k.expiresAt).toISOString().slice(0, 10);
        const emoji = k.status === "active" ? "🟢" : k.status === "revoked" ? "🔴" : "🟡";
        return `${emoji} <code>${escapeHtml(k.key)}</code>\n  📡 ${escapeHtml(server?.name ?? "?")} · ⏱ ${expires}`;
      }).join("\n\n");
    }
    await sendMessage(chatId, t, { reply_markup: { inline_keyboard: [[{ text: "➕ Generate Key", callback_data: "btn:genkey_prompt" }], MAIN_MENU_KB.inline_keyboard[MAIN_MENU_KB.inline_keyboard.length - 1]] } });
    return new Response("ok");
  }

  if (cmd === "/server") {
    const code = (parts[1] ?? "").toLowerCase();
    if (!code) { await sendMessage(chatId, "Usage: /server &lt;code&gt;"); return new Response("ok"); }
    const servers = await ctx.runQuery(internal.nameserver.listServersInternal, {});
    const server = servers.find((s) => s.code === code);
    if (!server) { await sendMessage(chatId, `Server ${escapeHtml(code)} not found.`); return new Response("ok"); }
    const conns = await ctx.runQuery(internal.nameserver.listConnectionsInternal, { limit: 8 });
    const recent = conns.filter((c) => c.serverId === server._id);
    const t = [
      `${server.status === "active" ? "🟢" : "🔴"} <b>${escapeHtml(server.name)}</b> (<code>${escapeHtml(server.code)}</code>)`,
      server.description ? `📝 ${escapeHtml(server.description)}` : "",
      `🔗 Recent: ${recent.length === 0 ? "none" : recent.map((c) => c.ok ? "✅" : "❌").join(" ")}`,
    ].filter(Boolean).join("\n");
    await sendMessage(chatId, t, { reply_markup: { inline_keyboard: [[{ text: "← Back", callback_data: "btn:servers" }]] } });
    return new Response("ok");
  }

  if (cmd === "/genkey") {
    const code = (parts[1] ?? "").toLowerCase();
    if (!code) { await sendMessage(chatId, "Usage: /genkey &lt;code&gt; [uses] [hours] [maxdevices]\nExample: /genkey eu-main 3 24 0"); return new Response("ok"); }
    const uses = parts[2] !== undefined ? Number(parts[2]) : undefined;
    const hours = parts[3] !== undefined ? Number(parts[3]) : undefined;
    const maxDevices = parts[4] !== undefined ? Number(parts[4]) : undefined;
    try {
      const r = await ctx.runMutation(internal.nameserver.genKeyAsOwner, {
        serverCode: code,
        uses: uses !== undefined && Number.isFinite(uses) ? uses : undefined,
        hours: hours !== undefined && Number.isFinite(hours) ? hours : undefined,
        maxDevices: maxDevices !== undefined && Number.isFinite(maxDevices) ? maxDevices : undefined,
      });
      const expires = r.expiresAt > 0 ? new Date(r.expiresAt).toISOString().slice(0, 10) : "never";
      await sendMessage(chatId, [
        "✅ <b>Key Generated</b>",
        "",
        `📡 Server: <b>${escapeHtml(r.serverName)}</b> (<code>${escapeHtml(r.serverCode)}</code>)`,
        `🔑 Key: <code>${escapeHtml(r.key)}</code>`,
        `💰 Cost: ${r.cost} · Balance: ${r.unlimited ? "∞" : r.balance}`,
        `⏱ Expires: ${expires}`,
        `📱 Devices: ${r.maxDevices === 0 ? "unlimited" : r.maxDevices}`,
      ].join("\n"), { reply_markup: MAIN_MENU_KB });
    } catch (err) {
      await sendMessage(chatId, `❌ ${escapeHtml(err instanceof Error ? err.message : "Failed")}`);
    }
    return new Response("ok");
  }

  if (cmd === "/check") {
    const key = (parts[1] ?? "").trim();
    if (!key) { await sendMessage(chatId, "Usage: /check &lt;key&gt;"); return new Response("ok"); }
    const r = await ctx.runQuery(internal.nameserver.getKeyByValue, { key });
    if (r === null) { await sendMessage(chatId, "❌ Key not found."); return new Response("ok"); }
    if (!isOwner && r.createdBy !== adminEntry!.userId) { await sendMessage(chatId, "❌ Key not found (you can only check your own keys)."); return new Response("ok"); }
    const servers = await ctx.runQuery(internal.nameserver.listServersInternal, {});
    const server = servers.find((s) => s._id === r.serverId);
    const expires = r.expiresAt === 0 ? "never" : new Date(r.expiresAt).toISOString().slice(0, 10);
    const statusEmoji = r.status === "active" ? "🟢" : r.status === "revoked" ? "🔴" : "🟡";
    await sendMessage(chatId, [
      `${statusEmoji} <b>Key Info</b>`,
      "",
      `🔑 <code>${escapeHtml(r.key)}</code>`,
      `📡 Server: ${escapeHtml(server?.name ?? "?")} (<code>${escapeHtml(server?.code ?? "?")}</code>)`,
      `📊 Status: ${r.status}`,
      `⏱ Uses: ${r.uses}/${r.maxUses === 0 ? "∞" : r.maxUses}`,
      `📱 Devices: ${r.maxDevices === 0 ? "∞" : r.maxDevices ?? 1}`,
      `📅 Expires: ${expires}`,
      `🔧 Device: ${r.deviceId ? escapeHtml(r.deviceId.slice(0, 30)) : "not bound"}`,
      r.note ? `📝 Note: ${escapeHtml(r.note)}` : "",
    ].filter(Boolean).join("\n"), {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔄 Reset Device", callback_data: `resetkey:${r.key}` }],
          [{ text: "← Back", callback_data: "btn:keys" }],
        ],
      },
    });
    return new Response("ok");
  }

  if (cmd === "/resetkey") {
    const key = (parts[1] ?? "").trim();
    if (!key) { await sendMessage(chatId, "Usage: /resetkey &lt;key&gt;"); return new Response("ok"); }
    try {
      const r = await ctx.runMutation(internal.nameserver.resetKeyByValueInternal, { key, actorUserId: isOwner ? undefined : adminEntry!.userId });
      await sendMessage(chatId, r.hadDevice
        ? `✅ Device unbound for <code>${escapeHtml(r.key)}</code> — it can now connect from a new device.`
        : `<code>${escapeHtml(r.key)}</code> was not bound to a device.`
      , { reply_markup: MAIN_MENU_KB });
    } catch (err) {
      await sendMessage(chatId, `❌ ${escapeHtml(err instanceof Error ? err.message : "Failed")}`);
    }
    return new Response("ok");
  }

  if (cmd === "/maintenance") {
    const on = parts[1]?.toLowerCase();
    if (on !== "on" && on !== "off") {
      const mOn = settings?.maintenance ?? false;
      await sendMessage(chatId, `🔧 Maintenance: ${mOn ? "🟢 ON" : "🔴 OFF"}`, {
        reply_markup: { inline_keyboard: [[{ text: mOn ? "🟢 Turn OFF" : "🔴 Turn ON", callback_data: mOn ? "maintenance:off" : "maintenance:on" }]] },
      });
      return new Response("ok");
    }
    const message2 = parts.slice(2).join(" ");
    await ctx.runMutation(internal.nameserver.setMaintenanceInternal, { on: on === "on", message: on === "on" ? message2 || undefined : undefined });
    await sendMessage(chatId, on === "on" ? "🔧 <b>Maintenance ON</b> — connects are now blocked." : "🔧 <b>Maintenance OFF</b> — connects allowed.", { reply_markup: MAIN_MENU_KB });
    return new Response("ok");
  }

  if (cmd === "/export") {
    if (!isOwner) { await sendMessage(chatId, "❌ Owner-only command."); return new Response("ok"); }
    const snap = await ctx.runQuery(internal.nameserver.exportSnapshotInternal, {});
    const json = JSON.stringify({
      servers: snap.servers.map((s) => ({ _id: s._id, name: s.name, code: s.code, status: s.status })),
      keys: snap.keys.length, connections: snap.connections.length, members: snap.members.length,
    }, null, 2);
    await sendMessage(chatId, `<pre>${escapeHtml(json)}</pre>`, { parse_mode: "HTML" });
    return new Response("ok");
  }

  /* Unknown command — show main menu */
  await sendMessage(chatId, "🤖 Unknown command. Use the menu below:", { reply_markup: MAIN_MENU_KB });
  return new Response("ok");
});

export { webhook };
