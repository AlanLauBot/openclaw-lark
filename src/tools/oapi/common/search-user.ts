/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_search_user tool -- 搜索员工
 *
 * 通过应用身份列出通讯录成员并按关键词过滤。
 */

import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { Type } from '@sinclair/typebox';
import { assertLarkOk, createToolContext, handleInvokeErrorWithAutoAuth, json , registerTool } from '../helpers';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const SearchUserSchema = Type.Object({
  query: Type.String({
    description: '搜索关键词，用于匹配用户名（必填）',
  }),
  page_size: Type.Optional(
    Type.Integer({
      description: '分页大小，控制每次返回的用户数量（默认20，最大200）',
      minimum: 1,
      maximum: 200,
    }),
  ),
  page_token: Type.Optional(
    Type.String({
      description: '分页标识。首次请求无需填写；当返回结果中包含 page_token 时，可传入该值继续请求下一页',
    }),
  ),
});

// ---------------------------------------------------------------------------
// Params type
// ---------------------------------------------------------------------------

interface SearchUserParams {
  query: string;
  page_size?: number;
  page_token?: string;
}

interface TenantUser {
  open_id?: string;
  user_id?: string;
  union_id?: string;
  name?: string;
  en_name?: string;
  nickname?: string;
  email?: string;
  enterprise_email?: string;
  mobile?: string;
  department_ids?: string[];
}

interface TenantUserListData {
  has_more?: boolean;
  page_token?: string;
  items?: TenantUser[];
}

function normalizeSearchText(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function userMatchesQuery(user: TenantUser, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  const fields = [
    user.name,
    user.en_name,
    user.nickname,
    user.email,
    user.enterprise_email,
    user.mobile,
    user.open_id,
    user.user_id,
    user.union_id,
  ];
  return fields.some((field) => normalizeSearchText(field).includes(normalizedQuery));
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerSearchUserTool(api: OpenClawPluginApi): void {
  if (!api.config) return;
  const cfg = api.config;

  const { toolClient, log } = createToolContext(api, 'feishu_search_user');

  registerTool(
    api,
    {
      name: 'feishu_search_user',
      label: 'Feishu: Search User',
      description:
        '【以应用身份】搜索员工信息（通过关键词匹配姓名、手机号、邮箱或用户 ID）。返回匹配的员工列表，包含姓名、部门、open_id 等信息。',
      parameters: SearchUserSchema,
      async execute(_toolCallId: string, params: unknown) {
        const p = params as SearchUserParams;
        try {
          const client = toolClient();

          log.info(`search_user: query="${p.query}", page_size=${p.page_size ?? 20}`);

          const pageSize = p.page_size ?? 20;
          const res = await client.invoke(
            'feishu_search_user.default',
            (sdk, opts) =>
              sdk.contact.v3.user.list(
                {
                  params: {
                    user_id_type: 'open_id',
                    page_size: 200,
                    page_token: p.page_token,
                  },
                },
                opts,
              ),
            { as: 'tenant' },
          );
          assertLarkOk(res);

          const data = res.data as TenantUserListData | undefined;
          const users = (data?.items ?? []).filter((user) => userMatchesQuery(user, p.query)).slice(0, pageSize);
          const userCount = users.length;
          log.info(`search_user: found ${userCount} users`);

          return json({
            users,
            has_more: data?.has_more ?? false,
            page_token: data?.page_token,
          });
        } catch (err) {
          return await handleInvokeErrorWithAutoAuth(err, cfg);
        }
      },
    },
    { name: 'feishu_search_user' },
  );

}
