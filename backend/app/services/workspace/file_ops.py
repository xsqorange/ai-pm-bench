"""文件读取 / 写入(受沙箱保护)。"""
from __future__ import annotations
from pathlib import Path
from app.core.security import safe_resolve, PathSandboxError, assert_inside_workspace
from app.core.paths import WORKSPACE_IGNORE_DIRS, is_sensitive
from app.core.logger import logger


MAX_READ_BYTES = 200_000  # 200 KB


def read_text_file(rel_path: str) -> tuple[str, int, bool]:
    """读取文件。返回 (content, size, truncated)。

    - 相对路径会拼接到 WORKSPACE_ROOT
    - 敏感文件(.env / *.key 等)拒绝
    - 超过 MAX_READ_BYTES 自动截断
    """
    abs_path = safe_resolve(rel_path)
    if abs_path.is_dir():
        raise IsADirectoryError(f"是目录而非文件: {rel_path}")
    if is_sensitive(abs_path):
        raise PermissionError(f"禁止读取敏感文件: {abs_path.name}")
    if not abs_path.exists():
        raise FileNotFoundError(f"文件不存在: {rel_path}")

    size = abs_path.stat().st_size
    text = abs_path.read_text(encoding="utf-8", errors="replace")
    truncated = False
    if len(text) > MAX_READ_BYTES:
        text = text[:MAX_READ_BYTES] + "\n\n... [已截断,文件过大] ..."
        truncated = True
    return text, size, truncated


def write_text_file(
    rel_path: str, content: str, expected_original: str | None = None, confirm: bool = False,
) -> Path:
    """写入文件。必须 confirm=True;若 expected_original 提供则必须匹配。"""
    if not confirm:
        raise PermissionError("写入操作必须显式 confirm=True")
    abs_path = safe_resolve(rel_path)
    if is_sensitive(abs_path):
        raise PermissionError(f"禁止写入敏感文件: {abs_path.name}")

    abs_path.parent.mkdir(parents=True, exist_ok=True)

    if expected_original is not None and abs_path.exists():
        current = abs_path.read_text(encoding="utf-8", errors="replace")
        if current != expected_original:
            raise ValueError(
                "文件内容已被外部修改,请刷新后再写入(expected_original 不匹配)"
            )

    # 备份原文件
    if abs_path.exists():
        backup = abs_path.with_suffix(abs_path.suffix + ".bak")
        backup.write_text(abs_path.read_text(encoding="utf-8", errors="replace"), encoding="utf-8")
        logger.info(f"原文件已备份: {backup}")

    abs_path.write_text(content, encoding="utf-8")
    logger.info(f"文件已写入: {abs_path}")
    return abs_path


def list_dir(rel_path: str = ".", max_entries: int = 500) -> list[dict]:
    """列出目录。返回 [{name, type, size}]"""
    abs_path = safe_resolve(rel_path) if rel_path else safe_resolve(".")
    if not abs_path.is_dir():
        raise NotADirectoryError(f"不是目录: {rel_path}")
    entries = []
    for entry in sorted(abs_path.iterdir(), key=lambda p: (p.is_file(), p.name.lower())):
        if entry.name in WORKSPACE_IGNORE_DIRS or entry.name.startswith("."):
            continue
        try:
            stat = entry.stat()
        except OSError:
            continue
        entries.append({
            "name": entry.name,
            "type": "directory" if entry.is_dir() else "file",
            "size": stat.st_size if entry.is_file() else 0,
        })
        if len(entries) >= max_entries:
            break
    return entries