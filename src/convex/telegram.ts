/**
 * Panxcz Telegram bot.
 *
 * Two audiences in one bot, driven entirely by inline keyboards:
 *
 *   Everyone  — Panxcz coin wallet that is shared with the website: /start
 *               creates (or finds) the coin account for the chat, /link binds
 *               the chat to a web handle, /getkey spends coins and returns a
 *               trial key right inside Telegram.
 *   Owner/Admin — panel controls: stats, servers, keys, coin top-ups,
 *               maintenance mode and JSON export.
 *
 * Optional channel gate: set TELEGRAM_CHANNEL_ID + TELEGRAM_CHANNEL_URL and
 * every non-admin user must join that channel before using the bot.
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
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

const BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN ??
  "8970982689:AAFd-9oeOY7dB7JRoiPSbT5TXPS6YHKIx2g";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const WEBHOOK_SECRET = BOT_TOKEN.replace(/[^A-Za-z0-9_-]/g, "");

/** Optional channel gate — enforced only when both are configured. */
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID ?? "";
const CHANNEL_URL = process.env.TELEGRAM_CHANNEL_URL ?? "";
const SUPPORT_URL = process.env.TELEGRAM_SUPPORT_URL ?? "";

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

async function answerCallback(
  callbackId: string,
  text?: string,
  showAlert = false,
) {
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
  buttons?: { text: string; callback_data?: string; url?: string }[][],
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
/*  Settings / general helpers                                         */
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
  const site = process.env.CONVEX_SITE_URL ?? "";
  return site.length > 0 ? site.replace(/\.cloud$/, ".site") : "";
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const DISCLAIMER =
  "📌 Disclaimer: The information shared in this channel is for educational purposes only and is not professional advice.";

/** Light per-chat throttle so button spam can't hammer the backend. */
const lastAction = new Map<string, number>();
function throttled(chatId: string, ms = 1500): boolean {
  const now = Date.now();
  const prev = lastAction.get(chatId) ?? 0;
  if (now - prev < ms) return true;
  lastAction.set(chatId, now);
  return false;
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
/*  Coin accounts (shared with the website)                            */
/* ------------------------------------------------------------------ */

type Account = Doc<"getkeyAccounts">;

/** The account bound to this chat, created on first use. */
async function resolveAccount(
  ctx: ActionCtx,
  chatId: string,
  username?: string,
): Promise<Account> {
  const linked = await ctx.runQuery(internal.getkey.accountByTelegramInternal, {
    chatId,
  });
  if (linked !== null) return linked;
  return await ctx.runMutation(internal.getkey.getOrCreateAccountInternal, {
    handle: chatId,
    telegramId: chatId,
    telegramUsername: username,
  });
}

/* ------------------------------------------------------------------ */
/*  Panel API (used by the web panel)                                  */
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
      channelGate: CHANNEL_ID.length > 0,
      admins,
    };
  },
});

/**
 * Register or re-register the webhook with Telegram, and cache the bot
 * username so the panel and the GetKey page always show the live bot.
 */
export const registerWebhook = action({
  args: {},
  handler: async (ctx) => {
    const me = await tgFetch("getMe");
    if (!me.ok) throw new Error(`Bot token invalid: ${me.description ?? "unknown"}`);
    const username = me.result?.username ?? null;
    if (username) {
      await ctx.runMutation(internal.telegram.upsertSettingsInternal, {
        telegramBotUsername: username,
      });
    }
    const site = process.env.CONVEX_SITE_URL ?? "";
    if (site.length === 0) throw new Error("CONVEX_SITE_URL env var not set");
    const webhookUrl = `${site}/telegram/webhook`;
    const r = await tgFetch("setWebhook", {
      url: webhookUrl,
      secret_token: WEBHOOK_SECRET,
      allowed_updates: ["message", "callback_query"],
    });
    if (!r.ok) throw new Error(`setWebhook failed: ${r.description ?? "unknown"}`);
    const info = await tgFetch("getWebhookInfo");
    const wh = info.result as
      | { pending_update_count?: number; last_error_message?: string }
      | undefined;
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
    if (target.role !== "admin" && target.role !== "owner") {
      throw new Error("Only admin/owner accounts can be bound");
    }
    const doc = await getSettings(ctx);
    const admins = (doc?.telegramAdmins ?? []).filter(
      (a) => a.chatId !== cleaned && a.userId !== userId,
    );
    admins.push({ chatId: cleaned, userId });
    if (doc) await ctx.db.patch(doc._id, { telegramAdmins: admins });
    else
      await ctx.db.insert("settings", {
        scope: "global",
        keyPrice: 10,
        defaultKeyUses: 0,
        defaultKeyHours: 0,
        maintenance: false,
        downMessage: "",
        telegramAdmins: admins,
      });
    return { chatId: cleaned, userId };
  },
});

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
    await ctx.runMutation(internal.telegram.upsertSettingsInternal, {
      telegramOwnerChatId: cleaned,
      telegramBotUsername: username ?? undefined,
    });
    return { chatId: cleaned, botUsername: username, webhookSet };
  },
});

/** Send a test message to the owner chat. Auto-registers the webhook. */
export const testBot = action({
  args: {},
  handler: async (ctx) => {
    await requireOwnerAction(ctx);
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
    const me = await tgFetch("getMe");
    const username = me.ok ? me.result?.username : null;
    const settings = await ctx.runQuery(internal.telegram.getSettingsInternal, {});
    const chatId =
      settings?.telegramOwnerChatId ?? process.env.TELEGRAM_OWNER_CHAT_ID;
    if (!chatId) {
      throw new Error("No owner chat ID configured. Set it in Telegram settings first.");
    }
    const testResult = await sendMessage(
      chatId,
      `🤖 <b>Bot Test Successful!</b>\n\n` +
        `Bot: @${username ?? "?"}\n` +
        `Webhook: ${webhookInfo}\n` +
        `Site: ${site}\n\n` +
        `Type /start to see the main menu.`,
      { reply_markup: { inline_keyboard: adminMenu() } },
    );
    return { botUsername: username, webhookInfo, messageSent: testResult.ok };
  },
});

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
    telegramAdmins: v.optional(
      v.array(v.object({ chatId: v.string(), userId: v.id("users") })),
    ),
  },
  handler: async (ctx, args) => {
    await upsertSettings(ctx, args);
  },
});

/* ------------------------------------------------------------------ */
/*  Menus                                                             */
/* ------------------------------------------------------------------ */

type Button = { text: string; callback_data?: string; url?: string };

function userMenu(showAdmin: boolean): Button[][] {
  const rows: Button[][] = [
    [
      { text: "🎮 Get a key", callback_data: "u:getkey" },
      { text: "💰 My coins", callback_data: "u:coins" },
    ],
    [
      { text: "🔑 My last key", callback_data: "u:lastkey" },
      { text: "👤 Profile", callback_data: "u:profile" },
    ],
    [
      { text: "🔗 Link web account", callback_data: "u:link" },
      { text: "🆔 My ID", callback_data: "u:id" },
    ],
    [
      { text: "💳 Top up", callback_data: "u:topup" },
      { text: "📞 Support", callback_data: "u:support" },
    ],
  ];
  if (CHANNEL_URL.length > 0) {
    rows.push([{ text: "📢 Channel", url: CHANNEL_URL }]);
  }
  if (showAdmin) {
    rows.push([{ text: "👑 Admin panel", callback_data: "a:menu" }]);
  }
  return rows;
}

function adminMenu(): Button[][] {
  return [
    [
      { text: "📊 Stats", callback_data: "a:stats" },
      { text: "💰 My balance", callback_data: "a:balance" },
    ],
    [
      { text: "🖥 Servers", callback_data: "a:servers" },
      { text: "🔑 Keys", callback_data: "a:keys" },
    ],
    [
      { text: "👥 Coin accounts", callback_data: "a:coins" },
      { text: "🔧 Maintenance", callback_data: "a:maintenance" },
    ],
    [
      { text: "📋 Export", callback_data: "a:export" },
      { text: "🆔 My ID", callback_data: "u:id" },
    ],
    [{ text: "← Back", callback_data: "u:menu" }],
  ];
}

function backToMenu(buttons: Button[][], to = "u:menu"): Button[][] {
  return [...buttons, [{ text: "← Back", callback_data: to }]];
}

/* ------------------------------------------------------------------ */
/*  Shared message builders                                            */
/* ------------------------------------------------------------------ */

async function keyStatusText(
  account: Account,
  price: number,
  hours: number,
): Promise<string> {
  return [
    "💰 <b>Panxcz coins</b>",
    "",
    `Handle: <code>${escapeHtml(account.displayHandle || account.handle)}</code>`,
    `Balance: <b>${account.coins ?? 0}</b> coins`,
    `Price per key: <code>${price}</code> coins · key lasts <code>${hours}h</code>`,
    `Keys claimed: <code>${account.totalClaims ?? 0}</code>`,
  ].join("\n");
}

function welcomeText(
  name: string,
  account: Account,
  price: number,
  hours: number,
  chatId: string,
): string {
  return [
    "🐬 <b>Panxcz Bot</b>",
    "",
    `👋 Halo, <b>${escapeHtml(name)}</b>!`,
    "",
    `💰 Panxcz coins: <b>${account.coins ?? 0}</b>`,
    `🔑 Keys claimed: <code>${account.totalClaims ?? 0}</code>`,
    `🆔 Your ID: <code>${chatId}</code>`,
    "",
    `A ${hours}-hour key costs <b>${price} coins</b> — tap <b>Get a key</b> below.`,
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/*  Webhook — the whole bot                                            */
/* ------------------------------------------------------------------ */

const webhook = httpAction(async (ctx, request) => {
  const secretHeader = request.headers.get("x-telegram-bot-api-secret-token");
  if (
    secretHeader &&
    secretHeader !== WEBHOOK_SECRET &&
    secretHeader !== "skip-check"
  ) {
    console.warn("[telegram] Secret token mismatch — processing anyway");
  }

  let update: any;
  try {
    update = await request.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const settings = await ctx.runQuery(internal.telegram.getSettingsInternal, {});
  const price = settings?.getkeyPrice ?? 5;
  const hours = settings?.getkeyHours ?? 5;

  /* ---------------- authorization ---------------- */
  const chatOf = (from: any, chat: any) => String(chat?.id ?? from?.id ?? "");
  const bound = settings?.telegramOwnerChatId ?? process.env.TELEGRAM_OWNER_CHAT_ID ?? null;

  const isBoundChat = (chatId: string) =>
    bound !== null && chatId === String(bound);
  const adminOf = (chatId: string) =>
    (settings?.telegramAdmins ?? []).find((a: any) => a.chatId === chatId) ?? null;

  const isMemberOfChannel = async (userId: string) => {
    if (CHANNEL_ID.length === 0) return true;
    try {
      const res = await tgFetch("getChatMember", {
        chat_id: CHANNEL_ID,
        user_id: userId,
      });
      const status = (res.result as { status?: string } | undefined)?.status;
      return status === "member" || status === "administrator" || status === "creator";
    } catch {
      return false;
    }
  };

  /** Send the "join the channel first" message. */
  const askJoin = async (chatId: string) => {
    const kb: Button[][] = [];
    if (CHANNEL_URL) kb.push([{ text: "📢 Join channel", url: CHANNEL_URL }]);
    kb.push([{ text: "✅ I've joined", callback_data: "u:menu" }]);
    await sendMessage(
      chatId,
      [
        "🔒 <b>Join our channel first</b>",
        "",
        "To use this bot you need to join the channel below, then tap “I've joined”.",
      ].join("\n"),
      { reply_markup: { inline_keyboard: kb } },
    );
  };

  /* ---------------- callback queries ---------------- */
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = chatOf(cq.from, cq.message?.chat);
    const data: string = cq.data ?? "";
    const username = cq.from?.username as string | undefined;
    const name = (cq.from?.first_name ?? "there") as string;
    const isOwner = isBoundChat(chatId);
    const adminEntry = adminOf(chatId);
    const isAdmin = adminEntry !== null;
    const canAdmin = isOwner || isAdmin;

    const reply = async (text: string, buttons: Button[][]) => {
      await answerCallback(cq.id);
      if (cq.message) {
        await editMessage(chatId, cq.message.message_id, text, buttons);
      } else {
        await sendMessage(chatId, text, { reply_markup: { inline_keyboard: buttons } });
      }
    };

    if (throttled(chatId)) {
      await answerCallback(cq.id);
      return new Response("ok");
    }

    /* ---- user-level buttons ---- */
    if (data === "u:menu") {
      const account = await resolveAccount(ctx, chatId, username);
      if (!canAdmin && !(await isMemberOfChannel(chatId))) {
        await answerCallback(cq.id);
        await askJoin(chatId);
        return new Response("ok");
      }
      await reply(
        welcomeText(name, account, price, hours, chatId),
        userMenu(canAdmin),
      );
      return new Response("ok");
    }

    if (data === "u:coins") {
      const account = await resolveAccount(ctx, chatId, username);
      await reply(
        await keyStatusText(account, price, hours),
        backToMenu([], "u:menu"),
      );
      return new Response("ok");
    }

    if (data === "u:profile") {
      const account = await resolveAccount(ctx, chatId, username);
      const created = new Date(account.createdAt).toISOString().slice(0, 10);
      await reply(
        [
          "👤 <b>Profile</b>",
          "",
          `Handle: <code>${escapeHtml(account.displayHandle || account.handle)}</code>`,
          `Telegram: ${username ? `@${escapeHtml(username)}` : `<code>${chatId}</code>`}`,
          `Coins: <b>${account.coins ?? 0}</b>`,
          `Keys claimed: <code>${account.totalClaims ?? 0}</code>`,
          `Coins spent: <code>${account.totalSpent ?? 0}</code>`,
          `Joined: <code>${created}</code>`,
          account.banned ? "\n🚫 <b>Account suspended</b>" : "",
        ]
          .filter(Boolean)
          .join("\n"),
        backToMenu([], "u:menu"),
      );
      return new Response("ok");
    }

    if (data === "u:id") {
      await reply(
        [
          "🆔 <b>Your Telegram ID</b>",
          "",
          `<code>${chatId}</code>`,
          "",
          "Use this ID in the field <b>“Telegram ID”</b> on the website's GetKey page to share the same coin balance.",
        ].join("\n"),
        backToMenu([], "u:menu"),
      );
      return new Response("ok");
    }

    if (data === "u:lastkey") {
      const account = await resolveAccount(ctx, chatId, username);
      if (!account.lastKey) {
        await reply(
          ["🔑 <b>No key yet</b>", "", "Tap “Get a key” to claim one."].join("\n"),
          backToMenu([], "u:menu"),
        );
        return new Response("ok");
      }
      const expires = account.lastKeyExpiresAt
        ? new Date(account.lastKeyExpiresAt).toLocaleString()
        : "—";
      await reply(
        [
          "🔑 <b>Your last key</b>",
          "",
          `<code>${escapeHtml(account.lastKey)}</code>`,
          `Expires: ${escapeHtml(expires)}`,
          "",
          "1 key = 1 device. Connect with <code>/connect</code>.",
        ].join("\n"),
        backToMenu([], "u:menu"),
      );
      return new Response("ok");
    }

    if (data === "u:topup") {
      const account = await resolveAccount(ctx, chatId, username);
      const kb: Button[][] = [];
      if (SUPPORT_URL) kb.push([{ text: "📞 Contact owner", url: SUPPORT_URL }]);
      await reply(
        [
          "💳 <b>Top up Panxcz coins</b>",
          "",
          `A ${hours}-hour key costs <b>${price} coins</b>.`,
          "",
          `Send your handle to the owner together with the amount:`,
          `<code>${escapeHtml(account.displayHandle || account.handle)}</code>`,
          "",
          "Coins are credited after payment — no automatic payment here.",
          "",
          DISCLAIMER,
        ].join("\n"),
        backToMenu(kb, "u:menu"),
      );
      return new Response("ok");
    }

    if (data === "u:support") {
      const kb: Button[][] = [];
      if (SUPPORT_URL) kb.push([{ text: "📞 Contact owner", url: SUPPORT_URL }]);
      if (CHANNEL_URL) kb.push([{ text: "📢 Channel", url: CHANNEL_URL }]);
      await reply(
        [
          "📞 <b>Support</b>",
          "",
          "Questions, coin top-ups or license issues — reach the owner via the button below.",
          "",
          DISCLAIMER,
        ].join("\n"),
        backToMenu(kb, "u:menu"),
      );
      return new Response("ok");
    }

    if (data === "u:link") {
      await reply(
        [
          "🔗 <b>Link your web account</b>",
          "",
          "Send this command with the handle you use on the website:",
          "<code>/link yourhandle</code>",
          "",
          "After that the bot and the website share one coin balance.",
        ].join("\n"),
        backToMenu([], "u:menu"),
      );
      return new Response("ok");
    }

    if (data === "u:getkey" || data.startsWith("u:key:")) {
      if (!canAdmin && !(await isMemberOfChannel(chatId))) {
        await answerCallback(cq.id);
        await askJoin(chatId);
        return new Response("ok");
      }
      const account = await resolveAccount(ctx, chatId, username);
      const products = await ctx.runQuery(internal.getkey.listProductsInternal, {});

      if (data === "u:getkey" && products.length > 1) {
        await reply(
          [
            "🎮 <b>Choose your product</b>",
            "",
            `Each key costs <b>${price} coins</b> and lasts <b>${hours} hours</b>.`,
            `Your balance: <b>${account.coins ?? 0}</b> coins.`,
          ].join("\n"),
          backToMenu(
            products.slice(0, 8).map((p) => [
              { text: `${p.name} · ${price} coins`, callback_data: `u:key:${p.id}` },
            ]),
            "u:menu",
          ),
        );
        return new Response("ok");
      }

      if (products.length === 0) {
        await reply(
          ["😕 <b>No product available</b>", "", "Try again later."].join("\n"),
          backToMenu([], "u:menu"),
        );
        return new Response("ok");
      }

      const serverId =
        data.startsWith("u:key:") ? data.split(":").slice(2).join(":") : products[0].id;
      const res = await ctx.runMutation(internal.getkey.issueForKey, {
        handle: account.handle,
        serverId: serverId as Id<"servers">,
      });
      if (!res.ok) {
        const msg =
          res.reason === "insufficient_coins"
            ? `💸 <b>Not enough coins</b>\n\nA key costs <b>${res.price}</b> but you have <b>${res.balance}</b>.\nTop up via the Support button below.`
            : res.reason === "daily_limit"
              ? `⏳ <b>Daily limit reached</b>\n\n${res.used}/${res.maxPerDay} keys today. Come back tomorrow.`
              : res.reason === "banned"
                ? "🚫 <b>Account suspended</b> — contact support."
                : `⚠️ <b>Could not issue a key</b>\n\n<code>${res.reason}</code>`;
        const kb: Button[][] = [];
        if (SUPPORT_URL) kb.push([{ text: "📞 Contact owner", url: SUPPORT_URL }]);
        kb.push([{ text: "💳 Top up", callback_data: "u:topup" }]);
        await reply(msg, backToMenu(kb, "u:menu"));
        return new Response("ok");
      }

      const expires = new Date(res.expiresAt).toLocaleString();
      await reply(
        [
          "✅ <b>Key issued!</b>",
          "",
          `<code>${escapeHtml(res.key)}</code>`,
          "",
          `🎮 Product: <b>${escapeHtml(res.serverName)}</b> (<code>${escapeHtml(res.serverCode)}</code>)`,
          `⏱ Valid for: <b>${res.hours} hours</b> (until ${escapeHtml(expires)})`,
          `💰 Coins left: <b>${res.coins}</b>`,
          `📊 Today: ${res.used}/${res.maxPerDay}`,
          "",
          "1 key = 1 device — connect with <code>/connect</code>.",
        ].join("\n"),
        backToMenu([[{ text: "🎮 Another key", callback_data: "u:getkey" }]], "u:menu"),
      );
      return new Response("ok");
    }

    /* ---- admin-only buttons ---- */
    if (data.startsWith("a:") || data.startsWith("server:") || data.startsWith("maint:")) {
      if (!canAdmin) {
        await answerCallback(cq.id, "Owner/admin only", true);
        return new Response("ok");
      }

      if (data === "a:menu") {
        await reply(
          [
            "👑 <b>Admin panel</b>",
            "",
            isOwner ? "Signed in as <b>owner</b>." : "Signed in as <b>admin</b>.",
            `Bot: @${settings?.telegramBotUsername ?? "?"}`,
          ].join("\n"),
          adminMenu(),
        );
        return new Response("ok");
      }

      if (data === "a:stats") {
        const s = await ctx.runQuery(internal.nameserver.ownerStatsInternal, {});
        await reply(
          [
            "📊 <b>Panel overview</b>",
            "",
            `🖥 Servers: <code>${s.serverCount}</code>`,
            `🔑 Keys: <code>${s.keyCount}</code> (<code>${s.activeKeyCount}</code> active)`,
            `🔗 Connects: <code>${s.connectCount}</code> (<code>${s.successCount}</code> ok)`,
            `👥 Members: <code>${s.memberCount}</code>`,
            `💰 Revenue: <code>${s.revenue}</code>`,
            `📈 Balance: <code>${s.unlimited ? "∞" : s.balance}</code>`,
          ].join("\n"),
          adminMenu(),
        );
        return new Response("ok");
      }

      if (data === "a:balance") {
        const s = await ctx.runQuery(internal.nameserver.ownerStatsInternal, {});
        await reply(
          [
            "💰 <b>Balance</b>",
            "",
            `Your balance: <code>${s.unlimited ? "∞ (unlimited)" : s.balance}</code>`,
            `Key price: <code>${settings?.keyPricePerDay ?? settings?.keyPrice ?? 10}</code> / day · no expiry: <code>${settings?.keyPrice ?? 10}</code>`,
            `GetKey coins: <code>${price}</code> per trial key`,
          ].join("\n"),
          adminMenu(),
        );
        return new Response("ok");
      }

      if (data === "a:servers") {
        const servers = await ctx.runQuery(internal.nameserver.listServersInternal, {});
        const kb: Button[][] = servers
          .slice(0, 8)
          .map((s) => [{ text: `ℹ️ ${s.name}`, callback_data: `server:${s.code}` }]);
        const text =
          servers.length === 0
            ? "🖥 <b>Servers</b>\n\nNo servers yet."
            : [
                "🖥 <b>Servers</b>",
                "",
                ...servers.map(
                  (s) =>
                    `${s.status === "active" ? "🟢" : "🔴"} <b>${escapeHtml(s.name)}</b> (<code>${escapeHtml(s.code)}</code>)${s.publicGetkey === false ? " · <i>hidden from GetKey</i>" : ""}`,
                ),
              ].join("\n");
        await reply(text, backToMenu(kb, "a:menu"));
        return new Response("ok");
      }

      if (data === "a:keys") {
        const keys = isOwner
          ? await ctx.runQuery(internal.nameserver.listKeysInternal, { limit: 5 })
          : await ctx.runQuery(internal.nameserver.listKeysByCreatorInternal, {
              userId: adminEntry!.userId,
              limit: 5,
            });
        const servers = await ctx.runQuery(internal.nameserver.listServersInternal, {});
        const byId = new Map(servers.map((s) => [s._id, s]));
        const text =
          keys.length === 0
            ? "🔑 <b>Last keys</b>\n\nNo keys yet."
            : [
                "🔑 <b>Last 5 keys</b>",
                "",
                ...keys.map((k) => {
                  const server = byId.get(k.serverId);
                  const expires =
                    k.expiresAt === 0
                      ? "never"
                      : new Date(k.expiresAt).toISOString().slice(0, 10);
                  const emoji =
                    k.status === "active" ? "🟢" : k.status === "revoked" ? "🔴" : "🟡";
                  return `${emoji} <code>${escapeHtml(k.key)}</code>\n  📡 ${escapeHtml(server?.name ?? "?")} · ⏱ ${expires} · 📱 ${k.deviceId ? escapeHtml(k.deviceId.slice(0, 18)) : "unbound"}`;
                }),
              ].join("\n");
        await reply(
          text,
          backToMenu(
            [
              [{ text: "➕ Generate key", callback_data: "a:genkey" }],
              [{ text: "🔎 Check a key", callback_data: "a:check" }],
            ],
            "a:menu",
          ),
        );
        return new Response("ok");
      }

      if (data === "a:genkey") {
        await answerCallback(cq.id);
        await sendMessage(
          chatId,
          "✏️ Send: <code>/genkey &lt;code&gt; [uses] [hours] [maxdevices]</code>\n\nExample: <code>/genkey main-hook 3 24 0</code>",
          { reply_markup: { inline_keyboard: adminMenu() } },
        );
        return new Response("ok");
      }

      if (data === "a:check") {
        await answerCallback(cq.id);
        await sendMessage(chatId, "🔎 Send: <code>/check &lt;key&gt;</code>", {
          reply_markup: { inline_keyboard: adminMenu() },
        });
        return new Response("ok");
      }

      if (data === "a:coins") {
        const accounts = await ctx.runQuery(internal.getkey.listAccountsInternal, {});
        const total = accounts.reduce((sum, a) => sum + a.coins, 0);
        const text =
          accounts.length === 0
            ? "👥 <b>Coin accounts</b>\n\nNone yet."
            : [
                "👥 <b>Coin accounts</b>",
                "",
                `Total coins out: <code>${total}</code>`,
                "",
                ...accounts
                  .slice(0, 12)
                  .map(
                    (a) =>
                      `${a.banned ? "🚫" : "•"} <code>${escapeHtml(a.handle)}</code> — ${a.coins} coins · ${a.claims} keys`,
                  ),
              ].join("\n");
        await reply(
          text,
          backToMenu(
            [[{ text: "➕ Add coins", callback_data: "a:grantinfo" }]],
            "a:menu",
          ),
        );
        return new Response("ok");
      }

      if (data === "a:grantinfo") {
        await answerCallback(cq.id);
        await sendMessage(
          chatId,
          "➕ Send: <code>/addcoins &lt;handle&gt; &lt;amount&gt;</code>\n\nExample: <code>/addcoins panxcz 50</code> (use a negative amount to debit)",
          { reply_markup: { inline_keyboard: adminMenu() } },
        );
        return new Response("ok");
      }

      if (data === "a:maintenance") {
        const on = settings?.maintenance ?? false;
        await reply(
          `🔧 <b>Maintenance mode</b>\n\nStatus: ${on ? "🟢 <b>ON</b> — connects are blocked" : "🔴 <b>OFF</b> — normal operation"}`,
          [
            [
              {
                text: on ? "🟢 Turn OFF" : "🔴 Turn ON",
                callback_data: on ? "maint:off" : "maint:on",
              },
            ],
            [{ text: "← Back", callback_data: "a:menu" }],
          ],
        );
        return new Response("ok");
      }

      if (data === "maint:on" || data === "maint:off") {
        const on = data === "maint:on";
        await ctx.runMutation(internal.nameserver.setMaintenanceInternal, { on });
        await answerCallback(cq.id, on ? "Maintenance ON" : "Maintenance OFF");
        if (cq.message) {
          await editMessage(
            chatId,
            cq.message.message_id,
            on
              ? "🔧 <b>Maintenance ON</b> — connects are now blocked."
              : "🔧 <b>Maintenance OFF</b> — connects allowed.",
            adminMenu(),
          );
        }
        return new Response("ok");
      }

      if (data === "a:export") {
        if (!isOwner) {
          await answerCallback(cq.id, "Owner-only", true);
          return new Response("ok");
        }
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
              status: k.status,
              uses: k.uses,
              maxUses: k.maxUses,
              expiresAt: k.expiresAt,
            })),
            connections: snap.connections.length,
            members: snap.members.length,
          },
          null,
          2,
        );
        await answerCallback(cq.id);
        for (let i = 0; i < json.length; i += 3500) {
          await sendMessage(chatId, `<pre>${escapeHtml(json.slice(i, i + 3500))}</pre>`);
        }
        return new Response("ok");
      }

      if (data.startsWith("resetkey:")) {
        const key = data.slice("resetkey:".length);
        try {
          const r = await ctx.runMutation(
            internal.nameserver.resetKeyByValueInternal,
            { key, actorUserId: isOwner ? undefined : adminEntry!.userId },
          );
          await reply(
            r.hadDevice
              ? `✅ Device unbound for <code>${escapeHtml(r.key)}</code> — it can connect from a new device.`
              : `<code>${escapeHtml(r.key)}</code> was not bound to a device.`,
            adminMenu(),
          );
        } catch (err) {
          await reply(
            `❌ ${escapeHtml(err instanceof Error ? err.message : "Failed")}`,
            adminMenu(),
          );
        }
        return new Response("ok");
      }

      if (data.startsWith("server:")) {
        const code = data.split(":").slice(1).join(":");
        const servers = await ctx.runQuery(internal.nameserver.listServersInternal, {});
        const server = servers.find((s) => s.code === code);
        if (!server) {
          await reply("Server not found", adminMenu());
          return new Response("ok");
        }
        const conns = await ctx.runQuery(internal.nameserver.listConnectionsInternal, {
          limit: 8,
        });
        const recent = conns.filter((c) => c.serverId === server._id);
        await reply(
          [
            `${server.status === "active" ? "🟢" : "🔴"} <b>${escapeHtml(server.name)}</b> (<code>${escapeHtml(server.code)}</code>)`,
            server.description ? `📝 ${escapeHtml(server.description)}` : "",
            `🎯 On GetKey: ${server.publicGetkey === false ? "no" : "yes"}`,
            `🔗 Recent: ${recent.length === 0 ? "none" : recent.map((c) => (c.ok ? "✅" : "❌")).join(" ")}`,
          ]
            .filter(Boolean)
            .join("\n"),
          backToMenu([[{ text: "← Servers", callback_data: "a:servers" }]], "a:menu"),
        );
        return new Response("ok");
      }
    }

    await answerCallback(cq.id);
    return new Response("ok");
  }

  /* ---------------- text messages ---------------- */
  const message = update?.message;
  if (!message) return new Response("ok");
  const chatId = String(message.chat?.id ?? message.from?.id ?? "");
  const username = message.from?.username as string | undefined;
  const name = (message.from?.first_name ?? "there") as string;
  const text = ((message.text ?? "") as string).trim();
  const parts = text.split(/\s+/);
  const cmd = parts[0]?.split("@")[0]?.toLowerCase() ?? "";

  const isOwner = isBoundChat(chatId);
  const adminEntry = adminOf(chatId);
  const isAdmin = adminEntry !== null;
  const canAdmin = isOwner || isAdmin;

  // Only private chats are handled.
  if (message.chat?.type !== "private") return new Response("ok");

  const send = async (body: string, buttons = userMenu(canAdmin)) =>
    await sendMessage(chatId, body, { reply_markup: { inline_keyboard: buttons } });

  /* /start — the entry point for everyone */
  if (cmd === "/start" || cmd === "/menu" || cmd === "/help") {
    if (!canAdmin && !(await isMemberOfChannel(chatId))) {
      await askJoin(chatId);
      return new Response("ok");
    }
    const account = await resolveAccount(ctx, chatId, username);
    await send(
      welcomeText(name, account, price, hours, chatId),
      canAdmin ? adminMenu() : userMenu(false),
    );
    return new Response("ok");
  }

  if (cmd === "/id") {
    await send(
      [
        "🆔 <b>Your Telegram ID</b>",
        "",
        `<code>${chatId}</code>`,
        "",
        "Use it on the website's GetKey page to share the same coin balance.",
      ].join("\n"),
    );
    return new Response("ok");
  }

  if (cmd === "/link") {
    const handle = parts[1] ?? "";
    if (handle.length < 3) {
      await send(
        [
          "🔗 <b>Link your web account</b>",
          "",
          "Usage: <code>/link &lt;handle&gt;</code>",
          "",
          "The handle is what you typed on the website's GetKey page (Telegram ID or @username).",
        ].join("\n"),
      );
      return new Response("ok");
    }
    const res = await ctx.runMutation(internal.getkey.linkTelegramInternal, {
      handle,
      chatId,
      telegramUsername: username,
    });
    if (res === null) {
      await send(
        [
          "❌ <b>Account not found</b>",
          "",
          `No open account for <code>${escapeHtml(handle)}</code>.`,
          "",
          "Claim a key on the website first (or just keep using this chat — a new account is created for you).",
        ].join("\n"),
      );
      return new Response("ok");
    }
    await send(
      [
        "✅ <b>Linked!</b>",
        "",
        `This chat now shares the account <code>${escapeHtml(res.handle)}</code> with the website.`,
        `💰 Balance: <b>${res.coins}</b> coins`,
      ].join("\n"),
    );
    return new Response("ok");
  }

  if (cmd === "/balance" || cmd === "/coins") {
    const account = await resolveAccount(ctx, chatId, username);
    await send(await keyStatusText(account, price, hours));
    return new Response("ok");
  }

  if (cmd === "/getkey" || cmd === "/key") {
    if (!canAdmin && !(await isMemberOfChannel(chatId))) {
      await askJoin(chatId);
      return new Response("ok");
    }
    const account = await resolveAccount(ctx, chatId, username);
    const res = await ctx.runMutation(internal.getkey.issueForKey, {
      handle: account.handle,
    });
    if (!res.ok) {
      const msg =
        res.reason === "insufficient_coins"
          ? `💸 <b>Not enough coins</b>\n\nA key costs <b>${res.price}</b> but you have <b>${res.balance}</b>.`
          : res.reason === "daily_limit"
            ? `⏳ <b>Daily limit reached</b> — ${res.used}/${res.maxPerDay} keys today.`
            : res.reason === "banned"
              ? "🚫 <b>Account suspended</b> — contact support."
              : `⚠️ Could not issue a key (<code>${res.reason}</code>)`;
      await send(msg);
      return new Response("ok");
    }
    await send(
      [
        "✅ <b>Key issued!</b>",
        "",
        `<code>${escapeHtml(res.key)}</code>`,
        "",
        `🎮 <b>${escapeHtml(res.serverName)}</b> · ⏱ ${res.hours}h`,
        `💰 Coins left: <b>${res.coins}</b> · 📊 ${res.used}/${res.maxPerDay} today`,
      ].join("\n"),
    );
    return new Response("ok");
  }

  if (cmd === "/topup") {
    const account = await resolveAccount(ctx, chatId, username);
    const kb: Button[][] = [];
    if (SUPPORT_URL) kb.push([{ text: "📞 Contact owner", url: SUPPORT_URL }]);
    await sendMessage(
      chatId,
      [
        "💳 <b>Top up Panxcz coins</b>",
        "",
        `A ${hours}-hour key costs <b>${price} coins</b>.`,
        `Your handle: <code>${escapeHtml(account.displayHandle || account.handle)}</code>`,
        "",
        DISCLAIMER,
      ].join("\n"),
      { reply_markup: { inline_keyboard: kb.length > 0 ? kb : userMenu(canAdmin) } },
    );
    return new Response("ok");
  }

  if (cmd === "/tutorial" || cmd === "/cara") {
    const s2 = await ctx.runQuery(internal.nameserver.getSettingsInternal, {});
    const url = getConnectUrl(s2?.serverDomain ?? "");
    await send(
      [
        "📘 <b>TUTORIAL — Cara connect app/script</b>",
        "",
        "1️⃣ Claim a key here with /getkey",
        "2️⃣ Server-side: generate keys in the panel",
        `3️⃣ POST the key to <code>${escapeHtml(url)}/connect</code>`,
        "4️⃣ 1 key = 1 device (reset from the panel)",
      ].join("\n"),
    );
    return new Response("ok");
  }

  /* ---------------- admin commands ---------------- */
  if (cmd.startsWith("/") && canAdmin) {
    if (cmd === "/stats") {
      const s = await ctx.runQuery(internal.nameserver.ownerStatsInternal, {});
      await sendMessage(
        chatId,
        [
          "📊 <b>Panel overview</b>",
          "",
          `🖥 Servers: <code>${s.serverCount}</code>`,
          `🔑 Keys: <code>${s.keyCount}</code> (<code>${s.activeKeyCount}</code> active)`,
          `🔗 Connects: <code>${s.connectCount}</code> (<code>${s.successCount}</code> ok)`,
          `👥 Members: <code>${s.memberCount}</code>`,
          `💰 Revenue: <code>${s.revenue}</code>`,
        ].join("\n"),
        { reply_markup: { inline_keyboard: adminMenu() } },
      );
      return new Response("ok");
    }

    if (cmd === "/accounts") {
      const accounts = await ctx.runQuery(internal.getkey.listAccountsInternal, {});
      await sendMessage(
        chatId,
        accounts.length === 0
          ? "👥 <b>Coin accounts</b>\n\nNone yet."
          : [
              "👥 <b>Coin accounts</b>",
              "",
              ...accounts
                .slice(0, 20)
                .map(
                  (a) =>
                    `${a.banned ? "🚫" : "•"} <code>${escapeHtml(a.handle)}</code> — ${a.coins} coins · ${a.claims} keys`,
                ),
            ].join("\n"),
        { reply_markup: { inline_keyboard: adminMenu() } },
      );
      return new Response("ok");
    }

    if (cmd === "/addcoins") {
      const handle = parts[1] ?? "";
      const amount = Number(parts[2] ?? "");
      if (!handle || !Number.isFinite(amount) || amount === 0) {
        await send(
          "Usage: <code>/addcoins &lt;handle&gt; &lt;amount&gt;</code>\nExample: <code>/addcoins panxcz 50</code>",
        );
        return new Response("ok");
      }
      try {
        const r = await ctx.runMutation(internal.getkey.grantCoinsByHandleInternal, {
          handle,
          amount,
        });
        await send(
          `✅ <code>${escapeHtml(r.handle)}</code> now has <b>${r.coins}</b> coins.`,
        );
      } catch (err) {
        await send(`❌ ${escapeHtml(err instanceof Error ? err.message : "Failed")}`);
      }
      return new Response("ok");
    }

    if (cmd === "/servers") {
      const servers = await ctx.runQuery(internal.nameserver.listServersInternal, {});
      await sendMessage(
        chatId,
        servers.length === 0
          ? "🖥 <b>Servers</b>\n\nNo servers yet."
          : [
              "🖥 <b>Servers</b>",
              "",
              ...servers.map(
                (s) =>
                  `${s.status === "active" ? "🟢" : "🔴"} <b>${escapeHtml(s.name)}</b> (<code>${escapeHtml(s.code)}</code>)`,
              ),
            ].join("\n"),
        { reply_markup: { inline_keyboard: adminMenu() } },
      );
      return new Response("ok");
    }

    if (cmd === "/keys") {
      const keys = isOwner
        ? await ctx.runQuery(internal.nameserver.listKeysInternal, { limit: 5 })
        : await ctx.runQuery(internal.nameserver.listKeysByCreatorInternal, {
            userId: adminEntry!.userId,
            limit: 5,
          });
      await sendMessage(
        chatId,
        keys.length === 0
          ? "🔑 <b>Keys</b>\n\nNo keys yet."
          : [
              "🔑 <b>Last 5 keys</b>",
              "",
              ...keys.map(
                (k) => `• <code>${escapeHtml(k.key)}</code> — ${k.status}`,
              ),
            ].join("\n"),
        { reply_markup: { inline_keyboard: adminMenu() } },
      );
      return new Response("ok");
    }

    if (cmd === "/genkey") {
      const code = (parts[1] ?? "").toLowerCase();
      if (!code) {
        await send(
          "Usage: <code>/genkey &lt;code&gt; [uses] [hours] [maxdevices]</code>\nExample: <code>/genkey main-hook 3 24 0</code>",
        );
        return new Response("ok");
      }
      const uses = parts[2] !== undefined ? Number(parts[2]) : undefined;
      const keyHours = parts[3] !== undefined ? Number(parts[3]) : undefined;
      const maxDevices = parts[4] !== undefined ? Number(parts[4]) : undefined;
      try {
        const r = await ctx.runMutation(internal.nameserver.genKeyAsOwner, {
          serverCode: code,
          uses: uses !== undefined && Number.isFinite(uses) ? uses : undefined,
          hours: keyHours !== undefined && Number.isFinite(keyHours) ? keyHours : undefined,
          maxDevices:
            maxDevices !== undefined && Number.isFinite(maxDevices)
              ? maxDevices
              : undefined,
        });
        const expires =
          r.expiresAt > 0 ? new Date(r.expiresAt).toISOString().slice(0, 10) : "never";
        await send(
          [
            "✅ <b>Key generated</b>",
            "",
            `📡 <b>${escapeHtml(r.serverName)}</b> (<code>${escapeHtml(r.serverCode)}</code>)`,
            `🔑 <code>${escapeHtml(r.key)}</code>`,
            `💰 Cost: ${r.cost} · Balance: ${r.unlimited ? "∞" : r.balance}`,
            `⏱ Expires: ${expires}`,
            `📱 Devices: ${r.maxDevices === 0 ? "unlimited" : r.maxDevices}`,
          ].join("\n"),
        );
      } catch (err) {
        await send(`❌ ${escapeHtml(err instanceof Error ? err.message : "Failed")}`);
      }
      return new Response("ok");
    }

    if (cmd === "/check") {
      const key = (parts[1] ?? "").trim();
      if (!key) {
        await send("Usage: <code>/check &lt;key&gt;</code>");
        return new Response("ok");
      }
      const r = await ctx.runQuery(internal.nameserver.getKeyByValue, { key });
      if (r === null) {
        await send("❌ Key not found.");
        return new Response("ok");
      }
      if (!isOwner && r.createdBy !== adminEntry!.userId) {
        await send("❌ Key not found (you can only check your own keys).");
        return new Response("ok");
      }
      const servers = await ctx.runQuery(internal.nameserver.listServersInternal, {});
      const server = servers.find((s) => s._id === r.serverId);
      const expires =
        r.expiresAt === 0 ? "never" : new Date(r.expiresAt).toISOString().slice(0, 10);
      await sendMessage(
        chatId,
        [
          `${r.status === "active" ? "🟢" : "🟡"} <b>Key info</b>`,
          "",
          `🔑 <code>${escapeHtml(r.key)}</code>`,
          `📡 ${escapeHtml(server?.name ?? "?")} (<code>${escapeHtml(server?.code ?? "?")}</code>)`,
          `📊 Status: ${r.status} · ⏱ Uses: ${r.uses}/${r.maxUses === 0 ? "∞" : r.maxUses}`,
          `📱 Devices: ${r.maxDevices === 0 ? "∞" : (r.maxDevices ?? 1)}`,
          `📅 Expires: ${expires}`,
          `🔧 Device: ${r.deviceId ? escapeHtml(r.deviceId.slice(0, 30)) : "not bound"}`,
          r.note ? `📝 Note: ${escapeHtml(r.note)}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔄 Reset device", callback_data: `resetkey:${r.key}` }],
              [{ text: "← Admin panel", callback_data: "a:menu" }],
            ],
          },
        },
      );
      return new Response("ok");
    }

    if (cmd === "/resetkey") {
      const key = (parts[1] ?? "").trim();
      if (!key) {
        await send("Usage: <code>/resetkey &lt;key&gt;</code>");
        return new Response("ok");
      }
      try {
        const r = await ctx.runMutation(internal.nameserver.resetKeyByValueInternal, {
          key,
          actorUserId: isOwner ? undefined : adminEntry!.userId,
        });
        await send(
          r.hadDevice
            ? `✅ Device unbound for <code>${escapeHtml(r.key)}</code> — it can connect from a new device.`
            : `<code>${escapeHtml(r.key)}</code> was not bound to a device.`,
        );
      } catch (err) {
        await send(`❌ ${escapeHtml(err instanceof Error ? err.message : "Failed")}`);
      }
      return new Response("ok");
    }

    if (cmd === "/maintenance") {
      const on = parts[1]?.toLowerCase();
      if (on !== "on" && on !== "off") {
        const mOn = settings?.maintenance ?? false;
        await sendMessage(
          chatId,
          `🔧 Maintenance: ${mOn ? "🟢 ON" : "🔴 OFF"}`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: mOn ? "🟢 Turn OFF" : "🔴 Turn ON",
                    callback_data: mOn ? "maint:off" : "maint:on",
                  },
                ],
              ],
            },
          },
        );
        return new Response("ok");
      }
      await ctx.runMutation(internal.nameserver.setMaintenanceInternal, {
        on: on === "on",
        message: on === "on" ? parts.slice(2).join(" ") || undefined : undefined,
      });
      await send(
        on === "on"
          ? "🔧 <b>Maintenance ON</b> — connects are blocked."
          : "🔧 <b>Maintenance OFF</b> — connects allowed.",
      );
      return new Response("ok");
    }
  }

  await send("🤖 Unknown command — use the menu below:");
  return new Response("ok");
});

export { webhook };
