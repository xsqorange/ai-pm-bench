"""统一日志:loguru,带文件输出 + 控制台彩色,敏感字段脱敏。"""
from __future__ import annotations
import re
import sys
from pathlib import Path
from loguru import logger
from app.config import settings


_SENSITIVE = re.compile(r"(api[_-]?key|token|secret|password)\s*[:=]\s*\S+", re.I)


def _scrub(text: str) -> str:
    return _SENSITIVE.sub(lambda m: f"{m.group(1)}=***", text)


class ScrubFilter:
    def __call__(self, record):
        record["message"] = _scrub(record["message"])
        return True


def setup_logger() -> None:
    logger.remove()
    logger.add(
        sys.stdout,
        level=settings.log_level,
        colorize=True,
        format="<green>{time:HH:mm:ss}</green> | <level>{level: <7}</level> | {message}",
        filter=ScrubFilter(),
    )
    log_path = Path(settings.data_dir) / "logs" / "workbench.log"
    logger.add(
        str(log_path),
        level=settings.log_level,
        rotation="10 MB",
        retention="30 days",
        encoding="utf-8",
        enqueue=False,  # 单用户本地工具,关闭多进程队列避免 Windows 命名管道权限问题
        filter=ScrubFilter(),
    )
    logger.info(f"日志初始化完成,文件: {log_path}")


setup_logger()
__all__ = ["logger"]