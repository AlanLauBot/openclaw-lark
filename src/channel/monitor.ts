/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * WebSocket monitoring for the Lark/Feishu channel plugin.
 *
 * Manages per-account WSClient connections and routes inbound Feishu
 * events (messages, bot membership changes, read receipts) to the
 * appropriate handlers.
 */

import * as http from 'node:http';
import type { ClawdbotConfig, RuntimeEnv } from 'openclaw/plugin-sdk';
import type { HistoryEntry } from 'openclaw/plugin-sdk/reply-history';
import * as Lark from '@larksuiteoapi/node-sdk';
import { getEnabledLarkAccounts, getLarkAccount } from '../core/accounts';
import { LarkClient } from '../core/lark-client';
import { larkLogger } from '../core/lark-logger';
import { drainShutdownHooks } from '../core/shutdown-hooks';
import { MessageDedup } from '../messaging/inbound/dedup';
import type { MonitorContext, MonitorFeishuOpts } from './types';
import {
  handleBotMembershipEvent,
  handleCardActionEvent,
  handleCommentEvent,
  handleMessageEvent,
  handleReactionEvent,
  handleVcMeetingInvitedEvent,
} from './event-handlers';

const mlog = larkLogger('channel/monitor');
const webhookServers = new Map<string, http.Server>();

// Re-export type for backward compatibility
export type { MonitorFeishuOpts } from './types';

// ---------------------------------------------------------------------------
// Single-account monitor
// ---------------------------------------------------------------------------

/**
 * Start monitoring a single Feishu account.
 *
 * Creates a LarkClient, probes bot identity, registers event handlers,
 * and starts a WebSocket connection. Returns a Promise that resolves
 * when the abort signal fires (or immediately if already aborted).
 */
async function monitorSingleAccount(params: {
  cfg: ClawdbotConfig;
  account: ReturnType<typeof getLarkAccount>;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
}): Promise<void> {
  const { account, runtime, abortSignal } = params;
  const { accountId } = account;
  const log = runtime?.log ?? ((...args: unknown[]) => mlog.info(args.map(String).join(' ')));
  const error = runtime?.error ?? ((...args: unknown[]) => mlog.error(args.map(String).join(' ')));

  const connectionMode = account.config.connectionMode ?? 'websocket';

  // Message dedup — filters duplicate deliveries from reconnects / retries.
  const dedupCfg = account.config.dedup;
  const messageDedup = new MessageDedup({
    ttlMs: dedupCfg?.ttlMs,
    maxEntries: dedupCfg?.maxEntries,
  });
  log(
    `feishu[${accountId}]: message dedup enabled (ttl=${messageDedup['ttlMs']}ms, max=${messageDedup['maxEntries']})`,
  );

  // Create LarkClient instance — manages SDK client, WS, and bot identity.
  const lark = LarkClient.fromAccount(account);

  // Attach dedup instance so it is disposed together with the client.
  lark.messageDedup = messageDedup;

  /** Per-chat history maps (used for group-chat context window). */
  const chatHistories = new Map<string, HistoryEntry[]>();

  const ctx: MonitorContext = {
    get cfg() {
      return LarkClient.runtime.config.loadConfig();
    },
    lark,
    accountId,
    chatHistories,
    messageDedup,
    runtime,
    log,
    error,
  };

  const handlers = {
    'im.message.receive_v1': (data: unknown) => handleMessageEvent(ctx, data),
    'im.message.message_read_v1': async () => {},
    'im.message.reaction.created_v1': (data: unknown) => handleReactionEvent(ctx, data),
    'im.message.reaction.deleted_v1': async () => {},
    'im.chat.access_event.bot_p2p_chat_entered_v1': async () => {},
    'im.chat.member.bot.added_v1': (data: unknown) => handleBotMembershipEvent(ctx, data, 'added'),
    'im.chat.member.bot.deleted_v1': (data: unknown) => handleBotMembershipEvent(ctx, data, 'removed'),
    'vc.bot.meeting_invited_v1': (data: unknown) => handleVcMeetingInvitedEvent(ctx, data),
    'drive.notice.comment_add_v1': (data: unknown) => handleCommentEvent(ctx, data),
    'card.action.trigger': ((data: unknown) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handleCardActionEvent(ctx, data)) as any,
  };

  if (connectionMode === 'webhook') {
    const probe = await lark.probe();
    log(`feishu[${accountId}]: bot open_id resolved: ${probe.ok ? (probe.botOpenId ?? 'unknown') : 'unknown'}`);

    const dispatcher = new Lark.EventDispatcher({
      encryptKey: account.config.encryptKey ?? '',
      verificationToken: account.config.verificationToken ?? '',
    });
    dispatcher.register(handlers);

    const port = account.config.webhookPort ?? 3000;
    const path = account.config.webhookPath ?? '/feishu/events';
    log(`feishu[${accountId}]: starting Webhook server on port ${port}, path ${path}...`);

    const server = http.createServer();
    const webhookHandler = Lark.adaptDefault(path, dispatcher, { autoChallenge: true });

    server.on('request', (req, res) => {
      void Promise.resolve(webhookHandler(req, res)).catch((err) => {
        error(`feishu[${accountId}]: webhook handler error: ${String(err)}`);
      });
    });

    webhookServers.set(accountId, server);

    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        webhookServers.delete(accountId);
        server.close();
      };

      const onAbort = () => {
        log(`feishu[${accountId}]: abort signal received, stopping Webhook server`);
        cleanup();
        resolve();
      };

      if (abortSignal?.aborted) {
        cleanup();
        resolve();
        return;
      }

      abortSignal?.addEventListener('abort', onAbort, { once: true });

      server.listen(port, () => {
        log(`feishu[${accountId}]: Webhook server listening on port ${port}`);
        mlog.info(`webhook started for account ${accountId} at ${path}`);
      });

      server.on('error', (err) => {
        abortSignal?.removeEventListener('abort', onAbort);
        webhookServers.delete(accountId);
        reject(err);
      });
    });
    return;
  }

  log(`feishu[${accountId}]: starting WebSocket connection...`);

  await lark.startWS({
    handlers,
    abortSignal,
  });

  // startWS resolves when abortSignal fires — probe result is logged inside startWS.
  log(`feishu[${accountId}]: bot open_id resolved: ${lark.botOpenId ?? 'unknown'}`);
  log(`feishu[${accountId}]: WebSocket client started`);
  mlog.info(`websocket started for account ${accountId}`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start monitoring for all enabled Feishu accounts (or a single
 * account when `opts.accountId` is specified).
 */
export async function monitorFeishuProvider(opts: MonitorFeishuOpts = {}): Promise<void> {
  const cfg = opts.config;
  if (!cfg) {
    throw new Error('Config is required for Feishu monitor');
  }

  // Store the original global config so plugin commands (doctor, diagnose)
  // can access cross-account information even when running inside an
  // account-scoped config context.
  LarkClient.setGlobalConfig(cfg);

  const log = opts.runtime?.log ?? ((...args: unknown[]) => mlog.info(args.map(String).join(' ')));

  // Single-account mode.
  if (opts.accountId) {
    const account = getLarkAccount(cfg, opts.accountId);
    if (!account.enabled || !account.configured) {
      throw new Error(`Feishu account "${opts.accountId}" not configured or disabled`);
    }
    await monitorSingleAccount({
      cfg,
      account,
      runtime: opts.runtime,
      abortSignal: opts.abortSignal,
    });
    await drainShutdownHooks({ log });
    return;
  }

  // Multi-account mode: start all enabled accounts in parallel.
  const accounts = getEnabledLarkAccounts(cfg);
  if (accounts.length === 0) {
    throw new Error('No enabled Feishu accounts configured');
  }

  log(`feishu: starting ${accounts.length} account(s): ${accounts.map((a) => a.accountId).join(', ')}`);

  await Promise.all(
    accounts.map((account) =>
      monitorSingleAccount({
        cfg,
        account,
        runtime: opts.runtime,
        abortSignal: opts.abortSignal,
      }),
    ),
  );
  await drainShutdownHooks({ log });
}
