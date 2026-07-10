import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';

const state = vi.hoisted(() => ({
  tools: { drive: true, perm: false },
  registered: [] as string[],
}));

vi.mock('../src/core/accounts', () => ({
  getEnabledLarkAccounts: () => [{ configured: true }],
}));

vi.mock('../src/core/tools-config', () => ({
  resolveAnyEnabledToolsConfig: () => state.tools,
}));

vi.mock('../src/tools/oapi/drive/file', () => ({
  registerFeishuDriveFileTool: () => {
    state.registered.push('file');
    return true;
  },
}));

vi.mock('../src/tools/oapi/drive/doc-comments', () => ({
  registerDocCommentsTool: () => {
    state.registered.push('comments');
    return true;
  },
}));

vi.mock('../src/tools/oapi/drive/doc-media', () => ({
  registerDocMediaTool: () => {
    state.registered.push('media');
    return true;
  },
}));

vi.mock('../src/tools/oapi/drive/doc-permission', () => ({
  registerDocPermissionTool: () => {
    state.registered.push('permission');
    return true;
  },
}));

import { registerFeishuDriveTools } from '../src/tools/oapi/drive/index';

const api = {
  config: {},
  logger: { debug: vi.fn() },
} as unknown as OpenClawPluginApi;

describe('drive tool registration', () => {
  beforeEach(() => {
    state.tools = { drive: true, perm: false };
    state.registered = [];
    vi.clearAllMocks();
  });

  it('does not expose permission management when perm is disabled', () => {
    registerFeishuDriveTools(api);

    expect(state.registered).toEqual(['file', 'comments', 'media']);
  });

  it('can expose permission management independently from drive tools', () => {
    state.tools = { drive: false, perm: true };

    registerFeishuDriveTools(api);

    expect(state.registered).toEqual(['permission']);
  });

  it('registers nothing when both capabilities are disabled', () => {
    state.tools = { drive: false, perm: false };

    registerFeishuDriveTools(api);

    expect(state.registered).toEqual([]);
  });
});
