"""应用配置:从 .env 加载,所有路径解析为绝对路径。"""
from __future__ import annotations
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


def _find_root() -> Path:
    """向上查找包含 backend/app 的项目根目录。"""
    cur = Path(__file__).resolve()
    for p in [cur, *cur.parents]:
        if (p / "backend" / "app").is_dir():
            return p
    return Path.cwd()


PROJECT_ROOT = _find_root()


class Settings(BaseSettings):
    # 基础
    app_name: str = "AI Workbench"
    log_level: str = "INFO"
    debug: bool = True

    # 工作区(扫描与文件操作的安全边界)
    workspace_root: str = r"D:\work\workspace"

    # 额外允许扫描的根目录(逗号分隔)。仅用于让工作台审查它自己的代码。
    # 默认空 — 仅 workspace_root 可被扫描/读。
    # 审查 ai-workbench 自己时,在 .env 设:EXTRA_SCAN_ROOTS=D:\work\ai-workbench
    extra_scan_roots: str = ""

    # 数据目录
    data_dir: str = r"D:\work\ai-workbench\data"

    # 数据库
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/ai_workbench"
    database_url_sync: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/ai_workbench"
    db_echo: bool = False

    # API
    api_prefix: str = "/api/v1"
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]

    # 安全
    max_upload_mb: int = 50
    chat_max_context_chars: int = 200_000
    review_max_chars: int = 120_000
    perf_max_chars: int = 80_000

    model_config = SettingsConfigDict(
        env_file=str(PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )


settings = Settings()
settings.workspace_root = str(Path(settings.workspace_root).resolve())
settings.data_dir = str(Path(settings.data_dir).resolve())

# 解析 extra_scan_roots 为 Path 列表(空则只允许 workspace_root)
_extra: list[Path] = []
if settings.extra_scan_roots.strip():
    for p in settings.extra_scan_roots.split(","):
        p = p.strip()
        if p:
            try:
                _extra.append(Path(p).resolve())
            except OSError:
                pass
# 用 object.__setattr__ 绕过 Pydantic 字段校验,挂载运行时计算的列表
object.__setattr__(
    settings,
    "extra_scan_roots_list",
    [settings.workspace_root, *_extra],
)

Path(settings.data_dir).mkdir(parents=True, exist_ok=True)
Path(settings.data_dir, "logs").mkdir(parents=True, exist_ok=True)
Path(settings.data_dir, "exports").mkdir(parents=True, exist_ok=True)
Path(settings.data_dir, "cache").mkdir(parents=True, exist_ok=True)