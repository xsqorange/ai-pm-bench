# 运维手册

## 启动 / 停止 / 重启

```bat
:: 启动(激活 venv → init_db → 后端 → 前端)
start.bat

:: 停止
stop.bat
:: 或
taskkill /FI "WINDOWTITLE eq Workbench-Backend*"
taskkill /FI "WINDOWTITLE eq Workbench-Frontend*"

:: 重启
restart.bat

:: 状态(端口 + 进程)
status.bat
```

启动后的监听端口:

- 后端 FastAPI: `http://127.0.0.1:8000`
- API 文档: `http://127.0.0.1:8000/docs`
- 前端 Next.js: `http://127.0.0.1:3000`
- WebSocket: `ws://127.0.0.1:8000/api/v1/chat/ws`

## 目录约定

| 路径 | 用途 |
|---|---|
| `D:\work\ai-workbench\backend\.venv` | 后端虚拟环境 |
| `D:\work\ai-workbench\backend\app` | 后端业务代码 |
| `D:\work\ai-workbench\backend\app\prompts\*.md` | 启动时扫描的提示词模板 |
| `D:\work\ai-workbench\frontend` | 前端 Next.js 项目 |
| `D:\work\ai-workbench\data\secrets.key` | Fernet 主密钥(0o600) |
| `D:\work\ai-workbench\data\logs\workbench.log` | loguru 输出(10MB 滚动 / 保留 30 天) |
| `D:\work\ai-workbench\data\cache\` | 临时调试脚本(可定期清理) |
| `D:\work\ai-workbench\data\exports\` | 文档导出目录 |
| `D:\work\workspace` | **受沙箱保护的** 工作区根,所有文件读写起点 |

## 环境变量(`.env`)

根 `.env.example` 是模板;真实配置在 `.env`。关键项:

```env
# 工作区边界
WORKSPACE_ROOT=D:\work\workspace

# 数据目录(日志/缓存/密钥)
DATA_DIR=D:\work\ai-workbench\data

# 后端监听
BACKEND_HOST=127.0.0.1
BACKEND_PORT=8000

# 前端端口(Next.js dev server)
FRONTEND_PORT=3000

# PostgreSQL
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/ai_workbench
DATABASE_URL_SYNC=postgresql+psycopg2://postgres:postgres@localhost:5432/ai_workbench

LOG_LEVEL=INFO
```

⚠️ **不要** 把真实 `.env` 提交到版本控制。
⚠️ `DATABASE_URL` 中的密码只是本地默认值,**生产部署前必须替换**。

## 数据库

### 初始化

`start.bat` 会自动调 `backend\scripts\init_db.py`,执行 `Base.metadata.create_all`(开发期)。

### 手动初始化

```powershell
cd D:\work\ai-workbench\backend
.venv\Scripts\activate
$env:PYTHONPATH = "D:\work\ai-workbench\backend"
python scripts\init_db.py
```

### 一次性脚本:规范化 provider 旧值

```powershell
python -m scripts.migrate_providers
```

会把 `agent_configs.provider` 中的 `MiniMax / MiniMax / DeepSeek / Kimi` 等历史字符串统一归一为内部名 `deepseek / kimi / minimax / openai`。

### 备份与恢复

```powershell
# 备份(逻辑导出,自定义格式)
pg_dump -U postgres -d ai_workbench -Fc -f backup.dump

# 恢复
pg_restore -U postgres -d ai_workbench -c backup.dump

# 或纯 SQL
pg_dump -U postgres -d ai_workbench > backup.sql
psql -U postgres -d ai_workbench < backup.sql
```

建议每天凌晨跑一次 `pg_dump`,保留 7 天滚动。

## 日志

- 文件: `D:\work\ai-workbench\data\logs\workbench.log`
- 控制台:彩色 `<时间> | <等级> | <消息>`
- 滚动:10MB 自动切分
- 保留:30 天
- 脱敏:`api_key|token|secret|password=...` 自动替换为 `***`

**查看最近错误**:`grep -i "error" data\logs\workbench.log`(PowerShell 用 `Select-String`)。

## 故障排查

### Q1: `start.bat` 报错 `[ERROR] DB init failed`

1. 确认 PostgreSQL 已启动:`Get-Service postgresql*` 或 `pg_isready -h localhost -p 5432`
2. 确认 `DATABASE_URL` 用户名密码正确,数据库 `ai_workbench` 已创建:
   ```powershell
   psql -U postgres -c "CREATE DATABASE ai_workbench;"
   ```
3. 防火墙未拦截 5432。

### Q2: 后端启动后,前端代理 502

- Next.js dev server 默认会直接连 `http://127.0.0.1:8000`(由 `lib/api.ts` 中的 `API_BASE` 决定),不走 Next rewrite。
- 检查 `frontend/.env.local`(若有)是否覆盖了 `API_BASE`。
- 用 `curl http://127.0.0.1:8000/healthz` 直接验证后端。

### Q3: WebSocket 连不上

前端 `lib/ws.ts` 直接连 `ws://127.0.0.1:8000/api/v1/chat/ws`。

- 浏览器必须能访问 `127.0.0.1:8000`(局域网访问需改 `lib/ws.ts` 的 `WS_URL`)。
- 用 `wscat -c ws://127.0.0.1:8000/api/v1/chat/ws` 测联通。
- 检查后端日志:每个 WS 帧会被 `chat_ws()` 记录。

### Q4: Agent `POST /agents/{id}/test` 返回 502

- 网络能否访问 LLM 端点:`curl https://api.deepseek.com/v1/models -H "Authorization: Bearer sk-..."`
- API Key 是否过期。
- `base_url` 是否带尾部 `/` 或错填。
- 临时打开 `LOG_LEVEL=DEBUG` 重启后端看详细堆栈。

### Q5: 文件读取报 403 / 路径越界

意味着路径不在 `WORKSPACE_ROOT`(`D:\work\workspace`)内。`safe_resolve()` 会:

- 拒绝包含 `..` 的路径段。
- 把绝对路径解析后必须 `relative_to(WORKSPACE_ROOT)`。

修正办法:把目标项目搬到 `D:\work\workspace` 下,或在 `.env` 中调整 `WORKSPACE_ROOT`(仅在确认不会越权访问敏感目录时)。

### Q7: Dashboard 一直"加载中"卡住

**症状**:浏览器访问 `http://127.0.0.1:3000/`,Dashboard 永远显示"加载中",浏览器 Network 面板里 `agents` / `projects` 请求一直 pending。

**根因**(几乎总是以下两种):

1. **8000 端口被孤儿 Python 进程占着**:`netstat -ano | findstr ":8000"`,看到 LISTENING 但访问 :8000 不返回响应 → 真正的 uvicorn 因 `WinError 10048` 启动失败。孤儿进程的 PID 不属于当前 start.bat 启动的 cmd 窗口,通常是过去某次调试脚本启动后忘掉的 `python3.13.exe`。

   解决:`taskkill /PID <孤儿PID> /F`,然后 `start.bat` 重启。

2. **后端真的死锁/假死**:PostgreSQL 卡住、LLM 调用阻塞、磁盘满等导致 uvicorn 进程在但不响应。

   解决:看 `data/logs/workbench.log` 最近的 INFO / WARNING / ERROR,定位后重启后端。

**前端已加防护**(本项目内置,无需配置):

- `frontend/lib/api.ts` 的 `request()` 现在带 15s timeout(`AbortController`),后端假死时 15s 后会抛错而不是无限 pending。
- `Dashboard` 把原本"默默吞错"的 `try {} catch {}` 改成了显式 `loading` + `error` state + "重试"按钮,失败时用户能看到具体错误信息。

如果你看到 Dashboard 显示"加载失败:请求超时(15s):后端 http://127.0.0.1:8000/api/v1 无响应",按提示排查后端即可。

### Q6: `data/cache/` 越来越大

`data/cache/` 是开发期调试脚本目录,可放心清理。

```powershell
Remove-Item D:\work\ai-workbench\data\cache\_*.py, _*.ps1, *.out, *.txt -ErrorAction SilentlyContinue
```

正式环境建议加一个每周清理的 PowerShell 计划任务。

## 性能调优

### 后端

- `app/config.py` 中的 `pool_size=10, max_overflow=20`(asyncpg 引擎)适合单用户并发;多用户场景调到 20/40。
- 大文件审查/性能分析时 `max_chars` 默认 60K/40K,可在请求体里调小以加速。
- 长上下文(超过 `chat_max_context_chars=200_000`)会被自动截断;调大可换更长的上下文窗口模型。

### 前端

- `npm run dev` 默认端口 3000;若被占用改 `FRONTEND_PORT`。
- 生产部署用 `npm run build && npm run start`,可显著降低首屏延迟。

### 数据库

- 定期 `VACUUM ANALYZE`(PostgreSQL)。
- `messages` 表是写入最频繁的,考虑按月分区或定期归档旧会话。

## 升级 / 迁移

### 升级后端依赖

```powershell
cd D:\work\ai-workbench\backend
.venv\Scripts\activate
pip install -U -r requirements.txt
python scripts\init_db.py   # 应用新增的 create_all
restart.bat
```

### 升级前端依赖

```powershell
cd D:\work\ai-workbench\frontend
npm install
npm run build
```

### 引入 Alembic(W3+ 计划)

当前用 `Base.metadata.create_all` 启动建表。W3+ 阶段建议:

1. `pip install alembic`
2. `alembic init backend/migrations`
3. `alembic revision --autogenerate -m "init"` 生成首版
4. 把 `init_db.py` 中的 `create_all` 替换为 `alembic upgrade head`

⚠️ 升级期间务必先 `pg_dump` 备份。

## 安全审计清单

- [x] 路径沙箱 (`safe_resolve`)
- [x] 敏感文件拦截 (`.env` / `*.key` / `*.pem` 等)
- [x] API Key Fernet 加密
- [x] 日志脱敏
- [x] CORS 仅本机
- [x] 写操作二次确认
- [x] 自动 `.bak` 备份
- [ ] Alembic 迁移(W3+)
- [ ] 速率限制 / 鉴权(W5+,目前完全本地单用户)
- [ ] 文件读取最大体积配置化(目前 200KB 硬编码)

## 联系 / 反馈

本项目为本地单用户工具,无外部 issue tracker;功能变更同步更新 `docs/` 对应章节。
