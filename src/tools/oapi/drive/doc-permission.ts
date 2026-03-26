/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_doc_permission tool -- 云文档权限/成员管理
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { Type } from '@sinclair/typebox';
import {
  json,
  createToolContext,
  assertLarkOk,
  handleInvokeErrorWithAutoAuth,
  registerTool,
  StringEnum,
} from '../helpers';

const DocPermissionSchema = Type.Object({
  action: StringEnum(['list', 'create', 'update', 'transfer_owner']),
  file_token: Type.String({ description: '云文档 token（docx/doc/sheet/bitable/file/slides）' }),
  file_type: StringEnum(['doc', 'docx', 'sheet', 'bitable', 'file', 'slides'], {
    description: '文档类型',
  }),
  token_type: Type.Optional(StringEnum(['tenant', 'user'], { description: '权限调用身份，默认 tenant' })),
  member_type: Type.Optional(
    StringEnum(['openid', 'userid', 'email', 'chatid', 'groupid'], {
      description: '成员类型（create/update 时必填）',
    }),
  ),
  member_id: Type.Optional(Type.String({ description: '成员 ID（create/update/transfer_owner 时必填）' })),
  perm: Type.Optional(
    StringEnum(['view', 'edit', 'full_access'], {
      description: '权限级别（create/update 时必填）',
    }),
  ),
  type: Type.Optional(StringEnum(['doc', 'docx', 'sheet', 'bitable', 'file', 'slides'])),
  page_size: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
  page_token: Type.Optional(Type.String()),
  need_notification: Type.Optional(Type.Boolean({ description: '转 owner 是否通知对方（可选）' })),
});

interface DocPermissionParams {
  action: 'list' | 'create' | 'update' | 'transfer_owner';
  file_token: string;
  file_type: 'doc' | 'docx' | 'sheet' | 'bitable' | 'file' | 'slides';
  token_type?: 'tenant' | 'user';
  member_type?: 'openid' | 'userid' | 'email' | 'chatid' | 'groupid';
  member_id?: string;
  perm?: 'view' | 'edit' | 'full_access';
  type?: 'doc' | 'docx' | 'sheet' | 'bitable' | 'file' | 'slides';
  page_size?: number;
  page_token?: string;
  need_notification?: boolean;
}

function validateParams(p: DocPermissionParams) {
  if ((p.action === 'create' || p.action === 'update') && (!p.member_type || !p.member_id || !p.perm)) {
    throw new Error('create/update 权限时必须提供 member_type、member_id、perm');
  }
  if (p.action === 'transfer_owner' && !p.member_id) {
    throw new Error('transfer_owner 时必须提供 member_id');
  }
}

export function registerDocPermissionTool(api: OpenClawPluginApi): boolean {
  if (!api.config) return false;
  const cfg = api.config;
  const { toolClient } = createToolContext(api, 'feishu_doc_permission');

  return registerTool(
    api,
    {
      name: 'feishu_doc_permission',
      label: 'Feishu: Doc Permission',
      description:
        '管理飞书云文档权限与协作者。支持 list（列出成员）, create（添加成员权限）, update（更新成员权限）, transfer_owner（转移 owner）。',
      parameters: DocPermissionSchema,
      async execute(_toolCallId: string, params: unknown) {
        const p = params as DocPermissionParams;
        try {
          validateParams(p);
          const client = toolClient();
          const asMode = p.token_type ?? 'tenant';
          const type = p.type ?? p.file_type;

          switch (p.action) {
            case 'list': {
              const res = await client.invoke(
                'feishu_doc_permission.list',
                (sdk: any, opts: any) =>
                  sdk.drive.v1.permissionMember.list(
                    {
                      path: { token: p.file_token },
                      params: {
                        type,
                        page_size: p.page_size,
                        page_token: p.page_token,
                      },
                    },
                    opts,
                  ),
                { as: asMode },
              );
              assertLarkOk(res);
              return json({
                members: res.data?.items ?? [],
                has_more: res.data?.has_more ?? false,
                page_token: res.data?.page_token,
              });
            }

            case 'create': {
              const res = await client.invoke(
                'feishu_doc_permission.create',
                (sdk: any, opts: any) =>
                  sdk.drive.v1.permissionMember.create(
                    {
                      path: { token: p.file_token },
                      params: { type },
                      data: {
                        member_type: p.member_type,
                        member_id: p.member_id,
                        perm: p.perm,
                      },
                    },
                    opts,
                  ),
                { as: asMode },
              );
              assertLarkOk(res);
              return json({ member: res.data });
            }

            case 'update': {
              const res = await client.invoke(
                'feishu_doc_permission.update',
                (sdk: any, opts: any) =>
                  sdk.drive.v1.permissionMember.update(
                    {
                      path: { token: p.file_token, member_id: p.member_id },
                      params: { type },
                      data: {
                        member_type: p.member_type,
                        perm: p.perm,
                      },
                    },
                    opts,
                  ),
                { as: asMode },
              );
              assertLarkOk(res);
              return json({ member: res.data });
            }

            case 'transfer_owner': {
              const res = await client.invoke(
                'feishu_doc_permission.transfer_owner',
                (sdk: any, opts: any) =>
                  sdk.drive.v1.permissionMember.transferOwner(
                    {
                      path: { token: p.file_token, member_id: p.member_id },
                      params: { type },
                      data: {
                        need_notification: p.need_notification,
                      },
                    },
                    opts,
                  ),
                { as: asMode },
              );
              assertLarkOk(res);
              return json({ success: true, data: res.data ?? null });
            }
          }
        } catch (err) {
          return await handleInvokeErrorWithAutoAuth(err, cfg);
        }
      },
    },
    { name: 'feishu_doc_permission' },
  );
}
