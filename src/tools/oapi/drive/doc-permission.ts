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
  StringEnum,
  assertLarkOk,
  createToolContext,
  handleInvokeErrorWithAutoAuth,
  json,
  registerTool,
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

interface DocPermissionMember {
  member_id?: string;
  member_type?: string;
  perm?: string;
  [key: string]: unknown;
}

interface DocPermissionListResponse {
  code?: number;
  msg?: string;
  data?: {
    items?: DocPermissionMember[];
    has_more?: boolean;
    page_token?: string;
  };
}

interface DocPermissionMutationResponse {
  code?: number;
  msg?: string;
  data?: DocPermissionMember | null;
}

function validateParams(params: DocPermissionParams): void {
  if (
    (params.action === 'create' || params.action === 'update') &&
    (!params.member_type || !params.member_id || !params.perm)
  ) {
    throw new Error('create/update 权限时必须提供 member_type、member_id、perm');
  }
  if (params.action === 'transfer_owner' && !params.member_id) {
    throw new Error('transfer_owner 时必须提供 member_id');
  }
}

export function registerDocPermissionTool(api: OpenClawPluginApi): boolean {
  if (!api.config) return false;
  const config = api.config;
  const { toolClient } = createToolContext(api, 'feishu_doc_permission');

  return registerTool(
    api,
    {
      name: 'feishu_doc_permission',
      label: 'Feishu: Doc Permission',
      description:
        '管理飞书云文档权限与协作者。支持 list（列出成员）, create（添加成员权限）, update（更新成员权限）, transfer_owner（转移 owner）。',
      parameters: DocPermissionSchema,
      async execute(_toolCallId: string, rawParams: unknown) {
        const params = rawParams as DocPermissionParams;
        try {
          validateParams(params);
          const client = toolClient();
          const asMode = params.token_type ?? 'tenant';
          const type = params.type ?? params.file_type;

          switch (params.action) {
            case 'list': {
              const result = await client.invoke<DocPermissionListResponse>(
                'feishu_doc_permission.list',
                (sdk: any, opts: any) =>
                  sdk.drive.v1.permissionMember.list(
                    {
                      path: { token: params.file_token },
                      params: {
                        type,
                        page_size: params.page_size,
                        page_token: params.page_token,
                      },
                    },
                    opts,
                  ),
                { as: asMode },
              );
              assertLarkOk(result);
              return json({
                members: result.data?.items ?? [],
                has_more: result.data?.has_more ?? false,
                page_token: result.data?.page_token,
              });
            }

            case 'create': {
              const result = await client.invoke<DocPermissionMutationResponse>(
                'feishu_doc_permission.create',
                (sdk: any, opts: any) =>
                  sdk.drive.v1.permissionMember.create(
                    {
                      path: { token: params.file_token },
                      params: { type },
                      data: {
                        member_type: params.member_type,
                        member_id: params.member_id,
                        perm: params.perm,
                      },
                    },
                    opts,
                  ),
                { as: asMode },
              );
              assertLarkOk(result);
              return json({ member: result.data });
            }

            case 'update': {
              const result = await client.invoke<DocPermissionMutationResponse>(
                'feishu_doc_permission.update',
                (sdk: any, opts: any) =>
                  sdk.drive.v1.permissionMember.update(
                    {
                      path: { token: params.file_token, member_id: params.member_id },
                      params: { type },
                      data: {
                        member_type: params.member_type,
                        perm: params.perm,
                      },
                    },
                    opts,
                  ),
                { as: asMode },
              );
              assertLarkOk(result);
              return json({ member: result.data });
            }

            case 'transfer_owner': {
              const result = await client.invoke<DocPermissionMutationResponse>(
                'feishu_doc_permission.transfer_owner',
                (sdk: any, opts: any) =>
                  sdk.drive.v1.permissionMember.transferOwner(
                    {
                      path: { token: params.file_token },
                      params: {
                        type,
                        need_notification: params.need_notification,
                        remove_old_owner: false,
                        stay_put: false,
                        old_owner_perm: 'full_access',
                      },
                      data: {
                        member_type: params.member_type ?? 'openid',
                        member_id: params.member_id,
                      },
                    },
                    opts,
                  ),
                { as: asMode },
              );
              assertLarkOk(result);
              return json({ success: true, data: result.data ?? null });
            }
          }
        } catch (error) {
          return handleInvokeErrorWithAutoAuth(error, config);
        }
      },
    },
    { name: 'feishu_doc_permission' },
  );
}
