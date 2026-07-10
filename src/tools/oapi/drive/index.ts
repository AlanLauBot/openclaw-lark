/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Drive 工具集
 * 统一导出所有云空间相关工具的注册函数
 */

import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { getEnabledLarkAccounts } from '../../../core/accounts';
import { resolveAnyEnabledToolsConfig } from '../../../core/tools-config';
import { registerFeishuDriveFileTool } from './file';
import { registerDocCommentsTool } from './doc-comments';
import { registerDocMediaTool } from './doc-media';
import { registerDocPermissionTool } from './doc-permission';

/**
 * 注册所有 Drive 工具
 */
export function registerFeishuDriveTools(api: OpenClawPluginApi): void {
  if (!api.config) {
    api.logger.debug?.('feishu_drive: No config available, skipping');
    return;
  }

  const accounts = getEnabledLarkAccounts(api.config);
  if (accounts.length === 0) {
    api.logger.debug?.('feishu_drive: No Feishu accounts configured, skipping');
    return;
  }

  const toolsCfg = resolveAnyEnabledToolsConfig(accounts);
  if (!toolsCfg.drive && !toolsCfg.perm) {
    api.logger.debug?.('feishu_drive: drive and permission tools disabled in all accounts');
    return;
  }

  // 注册所有工具
  const registered: string[] = [];
  if (toolsCfg.drive) {
    if (registerFeishuDriveFileTool(api)) registered.push('feishu_drive_file');
    if (registerDocCommentsTool(api)) registered.push('feishu_doc_comments');
    if (registerDocMediaTool(api)) registered.push('feishu_doc_media');
  }
  if (toolsCfg.perm && registerDocPermissionTool(api)) registered.push('feishu_doc_permission');
  if (registered.length > 0) {
    api.logger.debug?.(`feishu_drive: Registered ${registered.join(', ')}`);
  }
}
