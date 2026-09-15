"""Git 操作封装(基于 GitPython)。所有路径通过 safe_resolve 校验。"""
from __future__ import annotations
from pathlib import Path
from git import Repo, InvalidGitRepositoryError, GitCommandError
from app.core.security import WORKSPACE_ROOT, safe_resolve, PathSandboxError
from app.core.logger import logger
from app.core.git_auth import run_git_with_credentials


def _resolve_repo(project_rel_path: str) -> Repo:
    abs_path = safe_resolve(project_rel_path)
    if not abs_path.exists():
        raise ValueError(f"项目路径不存在: {project_rel_path}")
    try:
        return Repo(abs_path)
    except InvalidGitRepositoryError as e:
        raise ValueError(f"不是 Git 仓库: {project_rel_path}") from e


def status_of(project_rel_path: str) -> dict:
    repo = _resolve_repo(project_rel_path)
    try:
        branch = str(repo.active_branch)
    except TypeError:
        branch = "(detached HEAD)"
    return {
        "branch": branch,
        "is_dirty": repo.is_dirty(),
        "untracked": list(repo.untracked_files),
        "modified": [item.a_path for item in repo.index.diff(None)],
        "staged": [item.a_path for item in repo.index.diff("HEAD")],
    }


def log_of(project_rel_path: str, max_count: int = 20) -> list[dict]:
    repo = _resolve_repo(project_rel_path)
    commits = list(repo.iter_commits(max_count=max_count))
    return [
        {
            "sha": c.hexsha[:8],
            "full_sha": c.hexsha,
            "message": c.message.strip(),
            "author": str(c.author),
            "email": c.author.email or "",
            "date": c.committed_datetime.isoformat(),
        }
        for c in commits
    ]


def diff_of(project_rel_path: str, file_path: str | None = None, staged: bool = False) -> str:
    repo = _resolve_repo(project_rel_path)
    if staged:
        return repo.git.diff("--cached", *( [file_path] if file_path else [] ))
    if file_path:
        return repo.git.diff("--", file_path)
    return repo.git.diff()


def branches_of(project_rel_path: str) -> dict:
    repo = _resolve_repo(project_rel_path)
    local = [
        {"name": b.name, "is_active": b == repo.active_branch, "is_remote": False}
        for b in repo.branches
    ]
    remote = [
        {"name": b.name, "is_active": False, "is_remote": True}
        for b in repo.remote().refs  # type: ignore
    ] if repo.remotes else []
    return {"local": local, "remote": remote, "active": str(repo.active_branch)}


def create_branch(project_rel_path: str, name: str, checkout: bool = True) -> str:
    repo = _resolve_repo(project_rel_path)
    if name in [b.name for b in repo.branches]:
        raise ValueError(f"分支已存在: {name}")
    new_head = repo.create_head(name)
    if checkout:
        new_head.checkout()
    logger.info(f"[git] created branch {name} (checkout={checkout}) at {project_rel_path}")
    return name


def checkout_branch(project_rel_path: str, name: str) -> str:
    repo = _resolve_repo(project_rel_path)
    repo.git.checkout(name)
    logger.info(f"[git] checkout {name} at {project_rel_path}")
    return name


def commit_changes(project_rel_path: str, message: str, add_all: bool = True) -> dict:
    repo = _resolve_repo(project_rel_path)
    if add_all:
        repo.git.add(A=True)
    # 检查是否有 staged 变更
    if not repo.index.diff("HEAD"):
        raise ValueError("没有 staged 变更可以提交")
    commit = repo.index.commit(message)
    logger.info(f"[git] commit {commit.hexsha[:8]} at {project_rel_path}: {message}")
    return {"sha": commit.hexsha, "message": message}


def push_remote(project_rel_path: str, remote_name: str = "origin", branch: str | None = None) -> dict:
    repo = _resolve_repo(project_rel_path)
    branch = branch or str(repo.active_branch)
    if not repo.remotes:
        raise ValueError("项目没有配置 remote")
    cp = run_git_with_credentials(
        Path(repo.working_dir),
        ["push", remote_name, branch],
        timeout=120,
    )
    if cp.returncode != 0:
        raise RuntimeError(f"git push failed (code={cp.returncode}): {cp.stderr.strip()}")
    return {"remote": remote_name, "branch": branch, "summary": [cp.stdout.strip() or cp.stderr.strip() or "ok"]}


def pull_remote(project_rel_path: str, remote_name: str = "origin", branch: str | None = None) -> dict:
    repo = _resolve_repo(project_rel_path)
    branch = branch or str(repo.active_branch)
    cp = run_git_with_credentials(
        Path(repo.working_dir),
        ["pull", remote_name, branch],
        timeout=120,
    )
    if cp.returncode != 0:
        raise RuntimeError(f"git pull failed (code={cp.returncode}): {cp.stderr.strip()}")
    return {"remote": remote_name, "branch": branch, "summary": [cp.stdout.strip() or cp.stderr.strip() or "ok"]}