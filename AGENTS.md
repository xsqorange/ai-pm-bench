# AI Workbench — 项目级指令

> 当 Codex / 其他 AI agent 在本工作台工作时,先读本文。

## 项目性质
本地单用户 AI 开发工作台。**所有 API Key、数据库、文件操作均限定在本机**。

## 安全硬约束(违反即不安全)
1. 文件读写必须经过 `app/core/security.py:safe_resolve()` 校验,严禁绕过。
2. 所有写入操作前端必须弹窗二次确认;后端也必须二次校验。
3. 不允许 `shell=True`、`os.system()`、字符串拼接 shell 命令。
5. 不读取、不输出 `.env`、`*.key`、`*.pem`、`.git/`、`.ssh/` 内容。
6. 不在日志中打印 API Key,统一用 `***` 替代。

## 数据库
- PostgreSQL,连接串来自 `DATABASE_URL`。
- 表结构由 SQLAlchemy 模型自动创建(W1 阶段);Alembic 迁移在后续阶段。

## 目录约定
- 业务代码:`backend/app/`
- 提示词文件:`backend/app/prompts/*.md`(启动时扫描)
- 工作区:`D:\work\workspace`(只读 / 受控写入)
- 工作台自有数据:`D:\work\ai-workbench\data/`

## 输出风格
- 中文 Markdown,简洁直接。
- 代码块标注语言。
- 路径用反引号包裹。
- 重要结论加粗或 `⚠️ 警告` 标注。

## 启动 / 停止
- 启动:`.\start.bat`
- 停止:关闭对应的 cmd 窗口,或 `taskkill /FI "WINDOWTITLE eq Workbench-Backend*"`