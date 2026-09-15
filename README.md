# AI Workbench

> 本地单用户 AI 开发工作台 — 整合 DeepSeek / Kimi / MiniMax / OpenAI 兼容 LLM,管理 `D:\work\workspace` 项目,从需求、聊天、审查、性能到文档一站式闭环。

[![Python](https://img.shields.io/badge/Python-3.11%2F3.13-blue)](https://www.python.org) [![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688)](https://fastapi.tiangolo.com) [![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org) [![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-336791)](https://www.postgresql.org) [![License](https://img.shields.io/badge/license-本地私有-lightgrey)]()

---

## ✨ 核心能力

| 场景 | 能力 |
|---|---|
| 🤖 **多模型接入** | DeepSeek / Kimi / MiniMax / OpenAI 兼容 + MiniMax 老协议 fallback,Fernet 加密存储 API Key |
| 💬 **流式聊天** | WebSocket 流式对话 + 工具调用(`read_file` / `list_dir`)+ 二次 LLM 编排 |
| 📋 **需求管理** | 跨项目关联 + 状态/优先级 + LLM 自动生成联合方案 + 拆解子任务 |
| 🔍 **代码审查** | 切片 + LLM 解读 + 5 类目 × 5 级 JSON 解析容错 + 7 阶段 trajectory + SSE 实时推流 |
| ⚡ **性能分析** | 10 条静态正则规则 + LLM 给出可替换的优化代码片段 |
| 📄 **文档生成** | 5 种模板(`README / API / ARCH / CHANGELOG / DEPLOY`)+ AI 润色 + Markdown 导出 |
| 🌿 **Git 操作** | status / log / diff / branch / commit / push&pull,凭据通过 askpass 注入,不污染 `.git/config` |
| 🛡️ **安全模型** | 路径沙箱 + Fernet 加密 + 日志脱敏 + 写操作二次确认 + 自动备份 |

---

## 🏗️ 架构

```mermaid
flowchart LR
  subgraph Frontend["前端 (Next.js 14 :3000)"]
    UI["Dashboard / Agents / Chat<br/>Projects / Requirements<br/>Reviews / Performance / Documents"]
    WS["WebSocket Client<br/>lib/ws.ts"]
  end

  subgraph Backend["后端 (FastAPI :8000)"]
    API["REST API<br/>/api/v1/*"]
    WSAPI["WS /api/v1/chat/ws"]
    Orchestrator["services.agents.orchestrator"]
    Registry["services.agents.registry"]
    WSSvc["services.workspace.*"]
    Sec["core.security<br/>safe_resolve + Fernet"]
  end

  subgraph LLM["LLM 供应商"]
    DS["DeepSeek<br/>api.deepseek.com/v1"]
    KIMI["Kimi<br/>api.moonshot.cn/v1"]
    MM["MiniMax<br/>api.minimax.chat/v1"]
    LEGACY["MiniMax 老协议<br/>text/chatcompletion_v2"]
    OAI["OpenAI<br/>api.openai.com/v1"]
  end

  DB[("PostgreSQL<br/>ai_workbench")]
  FS[("D:\work\workspace<br/>受 safe_resolve 保护")]
  DATA[("D:\work\ai-workbench\data<br/>logs / cache / secrets.key")]

  UI <-.REST.-> API
  UI <-.WebSocket 流式.-> WSAPI
  API --> Orchestrator
  API --> WSSvc
  WSAPI --> Orchestrator
  Orchestrator --> Registry
  Registry -.OpenAI 兼容.-> DS
  Registry -.OpenAI 兼容.-> KIMI
  Registry -.OpenAI 兼容.-> MM
  Registry -.OpenAI 兼容.-> OAI
  Registry -.fallback.-> LEGACY
  API --> Sec
  API <-.-> DB
  WSSvc <-.-> FS
  API --> DATA
```

更多细节见 [`docs/architecture.md`](./docs/architecture.md)。

---

## 🚀 一键启动

### 前置依赖

- **Python 3.11 / 3.13**(已含 `.venv` 虚拟环境)
- **Node.js 18+**(用于前端)
- **PostgreSQL 14+**(本地默认账号 `postgres`)
- **Git**(供 `git_ops` 调用)

### 启动 / 停止

```powershell
# 启动(激活 venv → init_db → 后端 :8000 → 前端 :3000)
.\start.bat

# 停止
.\stop.bat

# 重启 / 查看状态
.\restart.bat
.\status.bat
```

启动后监听端口:

| 服务 | 地址 |
|---|---|
| 后端 FastAPI | `http://127.0.0.1:8000` |
| API 文档(Swagger) | `http://127.0.0.1:8000/docs` |
| 前端 Next.js | `http://127.0.0.1:3000` |
| WebSocket 聊天 | `ws://127.0.0.1:8000/api/v1/chat/ws` |

---

## 🧰 技术栈

### 后端

| 层 | 选型 |
|---|---|
| Web 框架 | FastAPI 0.115+ / Uvicorn |
| ORM | SQLAlchemy 2.0(异步) + asyncpg |
| 数据库 | PostgreSQL 14+ |
| 配置 | pydantic-settings(从 `.env` 读取) |
| HTTP 客户端 | httpx(异步,支持 SSE 流) |
| 加密 | cryptography.Fernet(AES-128 + HMAC) |
| 日志 | loguru(双输出 + `ScrubFilter` 脱敏) |
| Git | GitPython + 自写 askpass |
| Markdown | markdown-it-py |

### 前端

| 层 | 选型 |
|---|---|
| 框架 | Next.js 14(App Router)+ React 18 + TypeScript |
| 状态管理 | Zustand |
| 样式 | Tailwind CSS + 自定义主题色(`ink / bg / line / brand`) |
| 图标 | lucide-react |
| Markdown 渲染 | react-markdown + remark-gfm + react-syntax-highlighter |

---

## 🗂️ 目录结构

```text
D:\work\ai-workbench\
├─ start.bat / stop.bat / restart.bat / status.bat
├─ .env / .gitignore / AGENTS.md / README.md
├─ docs\                       # 架构 / API / 运维文档
├─ backend\
│  ├─ app\
│  │  ├─ main.py / config.py
│  │  ├─ api\                   # 10 个 REST 路由 + 1 个 WS
│  │  ├─ core\                  # security / paths / logger / git_auth
│  │  ├─ db\                    # 7 张 ORM 表
│  │  ├─ schemas\               # Pydantic v2 DTO
│  │  ├─ services\
│  │  │  ├─ agents\             # 4 家供应商适配器 + registry + 调度
│  │  │  ├─ workspace\          # file_ops / git_ops / reviewer / perf_analyzer
│  │  │  ├─ requirements.py
│  │  │  └─ documents.py
│  │  └─ prompts\*.md           # 5 份提示词模板
│  ├─ scripts\                  # init_db / migrate_providers / status
│  └─ requirements.txt
├─ data\                       # 工作台自有数据
│  ├─ secrets.key               # Fernet 主密钥(0o600,自动生成)
│  ├─ logs\workbench.log        # 10MB 滚动 / 保留 30 天
│  └─ cache\ / exports\
└─ frontend\
   ├─ app\(main)\              # 8 个路由页面
   ├─ components\               # Sidebar / ui / chat
   └─ lib\                      # api.ts / ws.ts / store.ts
```

---

## 🛡️ 安全模型

| 维度 | 实现 |
|---|---|
| 路径沙箱 | `safe_resolve()` 禁止 `..`,必须落在 `WORKSPACE_ROOT` 内 |
| 敏感文件 | `.env` / `*.pem` / `*.key` / `id_rsa*` 等 → `PermissionError` |
| API Key | Fernet 加密存储,`AgentOut` 只返回 `has_api_key: bool`,绝不返回明文 |
| 写操作 | `confirm=True` + 可选 `expected_original` 一致性 + 自动 `.bak` 备份 |
| 日志脱敏 | `api_key / token / secret / password=***` 自动替换 |
| CORS | 仅 `localhost:3000` / `127.0.0.1:*` |
| Git | 无 `shell=True`,子命令白名单;凭据通过 `GIT_ASKPASS` 注入 |

⚠️ **本地单用户工具,不暴露到公网**。`secrets.key` 与数据库同机时,整机备份 = 全部泄露,请使用 BitLocker 等加密磁盘。

---

## 🗃️ 数据模型(7 张表)

```mermaid
erDiagram
  agent_configs ||--o{ conversations : "fk agent_id"
  projects ||--o{ conversations : "fk project_id"
  requirements ||--o{ conversations : "fk requirement_id"
  conversations ||--o{ messages : "CASCADE"
  requirements ||--o{ subtasks : "CASCADE"
  projects ||--o{ review_reports : "CASCADE"
  projects ||--o{ performance_reports : "CASCADE"
  projects ||--o{ documents : "SET NULL"
```

| 表 | 用途 |
|---|---|
| `agent_configs` | LLM 供应商配置(key Fernet 加密) |
| `projects` | 工作区扫描出来的项目(含 git 信息) |
| `conversations` / `messages` | 多轮会话与单条消息 |
| `requirements` / `subtasks` | 跨项目需求与子任务 |
| `review_reports` | 审查产物(含 raw_llm + trajectory) |
| `performance_reports` | 静态规则 + AI 优化 |
| `documents` | 5 种模板的项目文档 |

---

## 📡 API 快速索引(共 10 个路由模块)

| 模块 | 路径 | 能力 |
|---|---|---|
| `agents` | `/api/v1/agents` | 多供应商 CRUD + 联通测试 |
| `chat` | `/api/v1/chat/ws` | **WebSocket** 流式对话 + 工具调用 |
| `conversations` | `/api/v1/conversations` | 历史 + Markdown 导出 |
| `projects` | `/api/v1/projects` | 扫描 + 目录树 + 文件读写(二次确认) |
| `git` | `/api/v1/projects/{id}/git/*` | status / log / diff / branch / commit / push / pull |
| `requirements` | `/api/v1/requirements` | CRUD + 方案生成 + 拆子任务 |
| `reviews` | `/api/v1/reviews` | 审查 + SSE 实时 trajectory |
| `performance` | `/api/v1/performance` | 静态规则 + AI 优化 |
| `documents` | `/api/v1/documents` | 生成 + 润色 + 导出 |
| `debug` | `/api/v1/debug/{ping,echo}` | 排查代理 / CORS |

完整 curl 示例见 [`docs/api.md`](./docs/api.md)。

---

## 📦 环境变量(`.env` 模板见 `.env.example`)

```env
WORKSPACE_ROOT=D:\work\workspace          # 文件操作安全边界
EXTRA_SCAN_ROOTS=                          # 可选,逗号分隔绝对路径
DATA_DIR=D:\work\ai-workbench\data       # 日志/缓存/Fernet 主密钥
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/ai_workbench
BACKEND_HOST=127.0.0.1
BACKEND_PORT=8000
FRONTEND_PORT=3000
LOG_LEVEL=INFO
```

> ⚠️ 根目录 `.env` 和 `/data/` 都已在 `.gitignore` 中,不会随代码提交。

---

## ✅ 进度

| 阶段 | 状态 |
|---|---|
| W1 后端骨架 + DB + 安全沙箱 | ✅ |
| W1 Provider Adapters(DeepSeek / Kimi / MiniMax / OpenAI) | ✅ |
| W2 WebSocket 聊天 + 前端 Next.js | ✅ |
| W2 项目扫描 + 目录树 + 文件读取 | ✅ |
| W3 文件写入(二次确认)+ Git 操作 | ✅ |
| W3 需求模块 + 解决方案生成 | ✅ |
| W4 代码审查 + 性能分析 | ✅ |
| W4 文档生成 + 导出 | ✅ |

详细文档:

- [`docs/architecture.md`](./docs/architecture.md) — 架构、数据流、安全模型、关键设计决策
- [`docs/api.md`](./docs/api.md) — REST + WebSocket 接口示例
- [`docs/operations.md`](./docs/operations.md) — 启动停止、备份恢复、故障排查
- [`AGENTS.md`](./AGENTS.md) — 项目级 AI 协作规则

---

## 📝 开发约定

- 中文 Markdown,代码块标注语言,路径用 `反引号`。
- 重要结论加粗或 ⚠️ 标注。
- 后端改动:同步更新对应 `docs/` 章节。
- 前端改动:同步更新 `frontend/app/(main)/<路由>/README`(如有)。
- 提交前:确认 `.env` / `data/` / `backend/.venv` / `frontend/node_modules` 未被 `git add`。
