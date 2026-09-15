"""扫描忽略目录 / Git 白名单 / 敏感文件名。"""
from __future__ import annotations
from pathlib import Path

# 扫描时跳过
WORKSPACE_IGNORE_DIRS = {
    "node_modules", "target", "dist", "build", ".gradle",
    "__pycache__", ".venv", "venv", ".idea", ".vscode",
    ".next", "out", ".git", "bin", "obj",
}

# 敏感文件名(不可读取 / 输出)
SENSITIVE_FILES = {
    ".env", ".env.local", ".env.production", ".env.development",
    "secrets.json", "secrets.yaml", "secrets.yml",
    "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519",
    "*.pem", "*.key", "*.pfx", "*.p12",
}

# Git 子命令白名单
ALLOWED_GIT_SUBCOMMANDS = {
    "status", "log", "diff", "branch", "add", "commit",
    "push", "pull", "fetch", "checkout", "stash", "show",
    "remote", "rev-parse", "init",
}

# 项目技术栈识别
TECH_MARKERS = {
    "java_maven": {"pom.xml"},
    "java_gradle": {"build.gradle", "build.gradle.kts"},
    "kotlin": {"build.gradle.kts"},
    "python_pip": {"requirements.txt"},
    "python_pyproject": {"pyproject.toml"},
    "node": {"package.json"},
    "rust": {"Cargo.toml"},
    "go": {"go.mod"},
    "docker": {"Dockerfile"},
    "compose": {"docker-compose.yml", "docker-compose.yaml"},
}


def is_sensitive(path: Path) -> bool:
    name = path.name.lower()
    if name in {s.lower() for s in SENSITIVE_FILES}:
        return True
    for pat in SENSITIVE_FILES:
        if pat.startswith("*") and name.endswith(pat[1:]):
            return True
    return False


def detect_stack(root: Path) -> list[str]:
    if not root.is_dir():
        return []
    files = {p.name for p in root.iterdir() if p.is_file()}
    stack: list[str] = []
    for tech, markers in TECH_MARKERS.items():
        if files & markers:
            stack.append(tech)
    return stack