# AI Workbench 文档

本地 AI 开发工作台的完整文档。所有设计、API、运维说明都在本目录。

## 目录

| 文件 | 内容 |
|---|---|
| [`architecture.md`](./architecture.md) | 系统架构、模块划分、数据流、关键设计决策 |
| [`api.md`](./api.md) | REST + WebSocket 接口示例(curl / 响应 / 状态码) |
| [`operations.md`](./operations.md) | 启动停止、备份恢复、故障排查、性能调优 |

## 5 分钟速览

1. **架构**:FastAPI 后端 + Next.js 前端 + PostgreSQL,统一通过 `registry.build_adapter()` 适配 4 家 LLM 供应商。
2. **API**:统一前缀 `/api/v1`,10 个路由模块,WebSocket 入口 `/api/v1/chat/ws`。完整列表见 [`api.md`](./api.md)。
3. **安全**:路径沙箱 + Fernet 加密 + 日志脱敏 + 二次确认。详见 [`architecture.md` § 安全模型](./architecture.md#安全模型)。
4. **运维**:`start.bat` / `stop.bat` 一键启停;日志 `data/logs/workbench.log`。详见 [`operations.md`](./operations.md)。

## 阅读顺序建议

- **新成员**:先读 [`architecture.md`](./architecture.md) → 再看 [`api.md`](./api.md) → 需要时翻 [`operations.md`](./operations.md)
- **开发新功能**:[`architecture.md` § 模块划分](./architecture.md#模块划分) + [`api.md`](./api.md) 对应模块
- **线上排障**:直接 [`operations.md` § 故障排查](./operations.md#故障排查)

## 文档维护

- 本目录与代码同源管理,功能变更需同步更新对应章节。
- 排版风格遵循 `AGENTS.md`(中文 Markdown + 代码块标语言 + 路径用反引号)。