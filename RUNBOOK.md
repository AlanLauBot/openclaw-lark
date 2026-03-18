# RUNBOOK.md

## Feishu 文档权限操作经验（已验证）

### 适用场景
- 给云文档增加查看/编辑/管理权限
- 查询协作者列表
- 转移 owner
- 插件当前没有现成 tool，但底层 API/SDK 可能支持

### 核心原则
**插件没封装，不等于 API 不支持。**
遇到权限相关请求时，默认顺序：
1. 先看现成 tool
2. 再看 `@larksuiteoapi/node-sdk`
3. 最后直接打 OpenAPI

不要在第 1 步失败后，直接回复“不会/不支持”。

---

## 已验证成功的接口

### 1. 给文档增加协作者权限
接口：
`POST /open-apis/drive/v1/permissions/{token}/members?type=docx&need_notification=false`

示例 body：
```json
{
  "member_type": "openid",
  "member_id": "ou_xxx",
  "perm": "full_access",
  "type": "user"
}
```

已验证：
- `perm=view`
- `perm=edit`
- `perm=full_access`

### 2. 查询协作者列表
接口：
`GET /open-apis/drive/v1/permissions/{token}/members?type=docx`

用途：
- 校验协作者是否已写入
- 检查权限是否生效

### 3. 可继续验证/尝试
SDK 已确认存在：
- `drive.permission.member.update`
- `drive.permission.member.transferOwner`

说明：
- 当前已明确成功的是“增加协作者 / 管理权限”
- `transfer_owner` 可作为后续继续验证项

---

## 实操建议
1. 优先使用 `openid` 作为 `member_type`
2. 对 docx 文档，`type=docx`
3. 写权限后，立刻再调一次 member list 做确认
4. 如果失败，不要笼统说“权限不支持”，要区分：
   - scope 没开
   - token 类型不对
   - 文档类型不对
   - API 路径/参数不对

---

## 与 MEMORY / TOOLS 的关系
- `MEMORY.md`：存长期结论
- `TOOLS.md`：存本地规则与提醒
- `RUNBOOK.md`：存真正可复用的执行步骤

这个问题属于：**应优先沉淀到 RUNBOOK 的已验证操作经验**。
