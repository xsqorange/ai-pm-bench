# API 参考

## 通用

- **Base URL**: `http://127.0.0.1:8000`
- **API 前缀**: `/api/v1`
- **自动文档**: <http://127.0.0.1:8000/docs> (Swagger UI) / <http://127.0.0.1:8000/redoc>
- **健康检查**: `GET /healthz` → `{"status":"ok"}`
- **Content-Type**: `application/json`(WebSocket 除外)
- **错误格式**: `{"detail": "...", "type": "...", "path": "..."}`(全局异常处理器统一)

## 路由清单

| 模块 | 路径前缀 | 说明 |
|---|---|---|
| agents | `/api/v1/agents` | 多供应商 LLM 配置 CRUD + 联通测试 |
| chat | `/api/v1/chat/ws` | **WebSocket** 流式对话 |
| conversations | `/api/v1/conversations` | 会话历史 + Markdown 导出 |
| projects | `/api/v1/projects` | 项目扫描 / 目录树 / 文件读写 |
| projects/{id}/git | `/api/v1/projects/{id}/git/*` | Git 操作(status/log/diff/branch/commit/push/pull) |
| requirements | `/api/v1/requirements` | 需求 CRUD + 方案生成 + 拆子任务 |
| reviews | `/api/v1/reviews` | 代码审查报告 |
| performance | `/api/v1/performance` | 性能分析报告(静态 + AI) |
| documents | `/api/v1/documents` | 项目文档(5 模板生成 + 润色 + 导出) |
| debug | `/api/v1/debug/ping` / `/echo` | 排查代理 / CORS / 请求体 |

## 1. Agents

### 创建 Agent

```bash
curl -X POST http://127.0.0.1:8000/api/v1/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ds-coder",
    "provider": "deepseek",
    "model": "deepseek-chat",
    "api_key": "sk-xxxxxxxxxxxx",
    "temperature": 0.3,
    "max_tokens": 4096,
    "system_prompt": "你是一名资深 Python 工程师。",
    "description": "DeepSeek 默认编码助手"
  }'
```

**响应 201**:`AgentOut` 完整对象。注意返回的 `has_api_key: true`,但绝不返回明文 key。

```json
{
  "id": 1,
  "name": "ds-coder",
  "provider": "deepseek",
  "model": "deepseek-chat",
  "base_url": "https://api.deepseek.com/v1",
  "temperature": 0.3,
  "max_tokens": 4096,
  "system_prompt": "你是一名资深 Python 工程师。",
  "description": "DeepSeek 默认编码助手",
  "enabled": true,
  "has_api_key": true,
  "extra": {}
}
```

### 联通测试

```bash
curl -X POST http://127.0.0.1:8000/api/v1/agents/1/test
```

**响应 200**:`{"ok": true, "agent": "ds-coder", "provider": "deepseek"}`

## 2. Projects

### 扫描工作区

```bash
curl -X POST http://127.0.0.1:8000/api/v1/projects/rescan
```

**响应 200**:`{"found": 5, "new": 3}`

### 列表

```bash
curl http://127.0.0.1:8000/api/v1/projects
```

### 目录树

```bash
curl "http://127.0.0.1:8000/api/v1/projects/1/tree?path=&max_depth=3"
```

### 读取文件

```bash
curl "http://127.0.0.1:8000/api/v1/projects/1/file?path=src/app/main.py"
```

### 写入文件(二次确认)

```bash
curl -X PUT http://127.0.0.1:8000/api/v1/projects/1/file \
  -H "Content-Type: application/json" \
  -d '{
    "path": "src/app/main.py",
    "content": "print(\"hello\")\n",
    "confirm": true,
    "expected_original": null
  }'
```

⚠️ **必须** `confirm: true`。若传 `expected_original` 且磁盘已变 → 403。

## 3. Git

```bash
# 状态
curl http://127.0.0.1:8000/api/v1/projects/1/git/status

# 最近 20 条提交
curl "http://127.0.0.1:8000/api/v1/projects/1/git/log?max_count=20"

# diff
curl "http://127.0.0.1:8000/api/v1/projects/1/git/diff?path=src/app/main.py&staged=false"

# 新建分支(可选 checkout)
curl -X POST http://127.0.0.1:8000/api/v1/projects/1/git/branches \
  -H "Content-Type: application/json" \
  -d '{"name":"feature/foo","checkout":true}'

# 提交(默认 add_all=true)
curl -X POST http://127.0.0.1:8000/api/v1/projects/1/git/commit \
  -H "Content-Type: application/json" \
  -d '{"message":"feat: add foo","add_all":true}'

# 推送到 origin/main
curl -X POST http://127.0.0.1:8000/api/v1/projects/1/git/push \
  -H "Content-Type: application/json" \
  -d '{"remote":"origin","branch":"main"}'
```

## 4. Chat (WebSocket)

### 协议

**Client → Server** (`/api/v1/chat/ws`):

```json
{ "type": "start", "agent_id": 1, "conversation_id": 0, "message": "你好", "tools": true }
```

**Server → Client**(可能多条):

```json
// 新建会话时
{ "type": "conversation", "id": 42 }
// 流式 token
{ "type": "delta", "content": "你好" }
// 模型要求工具调用(可选)
{ "type": "tool_call", "name": "read_file", "args": {"path": "src/main.py"} }
{ "type": "tool_result", "name": "read_file", "result": "[文件: src/main.py..." }
// 结束
{ "type": "done", "message_id": 99 }
// 异常
{ "type": "error", "message": "..." }
```

### 浏览器示例

```javascript
const ws = new WebSocket("ws://127.0.0.1:8000/api/v1/chat/ws");
ws.onopen = () => ws.send(JSON.stringify({
  type: "start", agent_id: 1, conversation_id: 0,
  message: "解释这段代码", tools: true,
}));
ws.onmessage = (e) => {
  const ev = JSON.parse(e.data);
  if (ev.type === "delta") append(ev.content);
  if (ev.type === "done") console.log("done", ev.message_id);
};
```

## 5. Conversations

```bash
# 列表(可按 agent_id / project_id 过滤)
curl "http://127.0.0.1:8000/api/v1/conversations?agent_id=1&limit=20"

# 详情(含消息)
curl http://127.0.0.1:8000/api/v1/conversations/42

# Markdown 导出
curl http://127.0.0.1:8000/api/v1/conversations/42/export

# 删除(级联删 messages)
curl -X DELETE http://127.0.0.1:8000/api/v1/conversations/42
```

## 6. Requirements

```bash
# 创建
curl -X POST http://127.0.0.1:8000/api/v1/requirements \
  -H "Content-Type: application/json" \
  -d '{
    "title": "用户登录支持 OAuth",
    "description": "支持 GitHub / Google 第三方登录",
    "status": "todo",
    "priority": "P1",
    "project_ids": [1, 2],
    "tags": ["auth","oauth"]
  }'

# 生成联合方案(LLM 写入 solution_doc)
curl -X POST http://127.0.0.1:8000/api/v1/requirements/1/solution \
  -H "Content-Type: application/json" \
  -d '{"agent_id": 1}'

# 拆 5 个子任务
curl -X POST http://127.0.0.1:8000/api/v1/requirements/1/decompose \
  -H "Content-Type: application/json" \
  -d '{"agent_id": 1, "count": 5}'

# 列出子任务
curl http://127.0.0.1:8000/api/v1/requirements/1/subtasks
```

## 7. Reviews

```bash
# 触发审查
curl -X POST http://127.0.0.1:8000/api/v1/reviews/run \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": 1,
    "agent_id": 1,
    "paths": ["src/"],
    "max_chars": 60000,
    "categories": ["bug","security","perf","smell","maintainability"]
  }'

# 列表(可按 project_id / severity 过滤)
curl "http://127.0.0.1:8000/api/v1/reviews?project_id=1&severity=warn"

# 详情
curl http://127.0.0.1:8000/api/v1/reviews/1
```

**响应字段**:`summary` / `severity[error|warn|info]` / `findings[]`(`file / line / severity / category / title / detail / suggestion`)。

## 8. Performance

```bash
curl -X POST http://127.0.0.1:8000/api/v1/performance/run \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": 1,
    "agent_id": 1,
    "paths": ["src/"],
    "max_chars": 40000
  }'
```

**响应字段**:`findings[]`(LLM 优化建议,含可替换代码) + `static_findings[]`(10 条静态正则命中)。

## 9. Documents

```bash
# 5 种 doc_type: README / API / ARCH / CHANGELOG / DEPLOY
curl -X POST http://127.0.0.1:8000/api/v1/documents/generate \
  -H "Content-Type: application/json" \
  -d '{"project_id": 1, "agent_id": 1, "doc_type": "README"}'

# AI 润色
curl -X POST http://127.0.0.1:8000/api/v1/documents/1/polish \
  -H "Content-Type: application/json" \
  -d '{"agent_id": 1, "instruction": "补充安全章节"}'

# Markdown 导出(直接下载 .md 文件)
curl -OJ http://127.0.0.1:8000/api/v1/documents/1/export
```

## 10. Debug

```bash
curl http://127.0.0.1:8000/api/v1/debug/ping
# 排查 Next.js 代理是否能正确转发 body
curl -X POST http://127.0.0.1:8000/api/v1/debug/echo \
  -H "Content-Type: application/json" \
  -d '{"foo":"bar"}'
```

## 状态码速查

| 码 | 含义 | 触发场景 |
|---|---|---|
| 200 | OK | 正常 |
| 201 | Created | POST 成功(创建 Agent / Requirement / Document) |
| 204 | No Content | DELETE 成功 |
| 400 | Bad Request | provider 不支持 / Git 子命令错 / JSON 解析失败 |
| 403 | Forbidden | 路径越界 / 写操作未 confirm / 读敏感文件 / expected_original 不匹配 |
| 404 | Not Found | 项目 / 资源不存在 |
| 409 | Conflict | Agent 名称重复 / DB 约束 |
| 500 | Server Error | DB 异常 / LLM 调用未捕获错误 |
## 已知坑:Next.js dev proxy + HMR 的 `ECONNRESET`

**症状**:终端报

```text
Compiled /documents in 330ms
Failed to proxy http://127.0.0.1:8000/api/v1/reviews/run Error: socket hang up
  code: ECONNRESET
```

**根因**:Next.js dev server 在编译/热重载其他页面时,会中断与后端的活跃 keep-alive HTTP 连接。WebSocket 走的是另一条路径(`lib/ws.ts` 直连后端),所以不受影响;但 REST 走 Next.js rewrite,就会偶发 ECONNRESET。

**解决方案**:`frontend/lib/api.ts` 已在 dev 模式自动直连后端(`http://127.0.0.1:8000/api/v1`),绕过 dev proxy。生产部署仍走 `/api/backend` rewrite。

如果仍需自定义后端地址,在 `frontend/.env.local` 设置 `NEXT_PUBLIC_API_BASE=http://your-host:port/api/v1`。

⚠️ 注意:ECONNRESET 只影响客户端连接;后端请求可能仍然成功(审查记录会落库并显示在 UI)。只是浏览器 fetch 会 reject,前端需要在 UI 层做更友好的错误提示。

| 502 | Bad Gateway | Agent 联通测试失败(LLM 不可达) |
