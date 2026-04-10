---
name: feishu-permission
description: |
  管理飞书云文档权限与协作者。支持查看成员、添加成员权限、更新成员权限、转移 owner。

  当以下情况时使用此 Skill：
  (1) 给飞书文档/表格/多维表/文件添加查看、编辑、管理权限
  (2) 查询某个文档当前有哪些协作者
  (3) 更新已有成员权限
  (4) 转移文档 owner
---

# Feishu Permission Skill

使用当前 `openclaw-lark` extension 内的 `feishu_doc_permission` tool 管理云文档权限。

## 支持动作

- `list`：列出当前文档/文件的成员权限
- `create`：新增成员并授予权限
- `update`：更新已有成员权限
- `transfer_owner`：转移 owner

## 必填参数

- `file_token`：文档 token
- `file_type`：`doc` / `docx` / `sheet` / `bitable` / `file` / `slides`

## create / update 额外参数

- `member_type`：通常用 `openid`
- `member_id`：成员 ID（如 `ou_xxx`）
- `perm`：`view` / `edit` / `full_access`

## transfer_owner 额外参数

- `member_id`：新 owner 的成员 ID
- `need_notification`：是否通知对方（可选）

## 默认建议

- 优先使用 `token_type=tenant`
- 常见给同事管理权限：
  - `member_type=openid`
  - `perm=full_access`

## 示例

### 列成员

```json
{
  "action": "list",
  "file_token": "J0m5dBZbIoS27axOs5jlud3vg4f",
  "file_type": "docx"
}
```

### 给成员 full_access

```json
{
  "action": "create",
  "file_token": "J0m5dBZbIoS27axOs5jlud3vg4f",
  "file_type": "docx",
  "member_type": "openid",
  "member_id": "ou_xxx",
  "perm": "full_access"
}
```
