"""安全模块:Fernet 加密 + 路径沙箱。"""
from __future__ import annotations
import os
from pathlib import Path
from cryptography.fernet import Fernet, InvalidToken
from app.config import settings
from app.core.logger import logger

SECRETS_KEY_PATH = Path(settings.data_dir) / "secrets.key"
WORKSPACE_ROOT = Path(settings.workspace_root).resolve()

# 允许的根目录列表(workspace_root + 可选 extra_scan_roots)
ALLOWED_ROOTS: list[Path] = [Path(r).resolve() for r in settings.extra_scan_roots_list]


class PathSandboxError(Exception):
    """路径越界或包含禁止片段。"""


class SecurityError(Exception):
    """通用安全错误。"""


def _load_or_create_fernet() -> Fernet:
    SECRETS_KEY_PATH.parent.mkdir(parents=True, exist_ok=True)
    if SECRETS_KEY_PATH.exists():
        key = SECRETS_KEY_PATH.read_bytes()
    else:
        key = Fernet.generate_key()
        SECRETS_KEY_PATH.write_bytes(key)
        try:
            os.chmod(SECRETS_KEY_PATH, 0o600)
        except OSError:
            # Windows 上 chmod 部分支持,忽略
            pass
        logger.info(f"已生成 Fernet 主密钥: {SECRETS_KEY_PATH}")
    return Fernet(key)


_FERNET = _load_or_create_fernet()


def encrypt(plain: str) -> str:
    if not plain:
        return ""
    return _FERNET.encrypt(plain.encode("utf-8")).decode("ascii")


def decrypt(token: str) -> str:
    if not token:
        return ""
    try:
        return _FERNET.decrypt(token.encode("ascii")).decode("utf-8")
    except InvalidToken as e:
        raise SecurityError("加密数据已损坏或密钥不匹配") from e


def _resolve_inside_allowed(p: Path) -> Path:
    """解析路径并校验其落在 ALLOWED_ROOTS 任一根目录下。"""
    candidate = p.resolve(strict=False)
    for root in ALLOWED_ROOTS:
        try:
            candidate.relative_to(root)
            return candidate
        except ValueError:
            continue
    raise PathSandboxError(
        f"禁止访问工作区外的路径: {candidate}(允许根: {[str(r) for r in ALLOWED_ROOTS]})"
    )


def safe_resolve(rel_or_abs: str | Path) -> Path:
    """把用户给定的路径解析为绝对路径,并确保落在 ALLOWED_ROOTS 内。

    - 禁止包含 `..` 路径段
    - 绝对路径 → 必须 relative_to(任一允许根)
    - 相对路径 → 拼接 WORKSPACE_ROOT(默认起点)
    """
    p = Path(rel_or_abs)
    if any(part == ".." for part in p.parts):
        raise PathSandboxError(f"路径中不允许包含 ..: {rel_or_abs}")

    if p.is_absolute():
        return _resolve_inside_allowed(p)
    # 相对路径:始终基于 WORKSPACE_ROOT 拼接
    return _resolve_inside_allowed(WORKSPACE_ROOT / p)


def assert_inside_workspace(p: Path) -> None:
    try:
        p.resolve().relative_to(WORKSPACE_ROOT)
    except ValueError as e:
        raise PathSandboxError(f"路径越界: {p}") from e
