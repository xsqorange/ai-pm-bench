"""项目扫描 + 文件读取/写入。"""
from __future__ import annotations
import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pathlib import Path
from app.db.session import get_session
from app.db.models.project import Project
from app.config import settings
from app.core.security import safe_resolve, PathSandboxError
from app.core.paths import WORKSPACE_IGNORE_DIRS, detect_stack
from app.core.logger import logger
from app.services.workspace.file_ops import read_text_file, write_text_file, list_dir
from app.services.workspace.git_ops import _resolve_repo, status_of
from app.schemas.project import FileReadResult, FileWriteRequest

router = APIRouter(prefix="/projects", tags=["projects"])


def _git_meta(project_path: str) -> tuple[str | None, bool]:
    """读取项目的 git 分支与 dirty 状态。失败返回 (None, False)。

    不抛异常 — 项目未必是 git 仓库,扫描时容错。
    """
    try:
        repo = _resolve_repo(project_path)
        try:
            branch = str(repo.active_branch)
        except TypeError:
            branch = "(detached HEAD)"
        is_dirty = repo.is_dirty()
        return branch, is_dirty
    except Exception:
        return None, False


@router.get("")
async def list_projects(db: AsyncSession = Depends(get_session)):
    rows = (await db.execute(select(Project).order_by(Project.name))).scalars().all()
    return [
        {
            "id": r.id, "name": r.name, "path": r.path,
            "tech_stack": r.tech_stack, "description": r.description,
            "last_modified": r.last_modified.isoformat() if r.last_modified else None,
            "git_branch": r.git_branch, "git_dirty": r.git_dirty,
        } for r in rows
    ]


@router.get("/{project_id}", response_model=dict)
async def get_project(project_id: int, db: AsyncSession = Depends(get_session)):
    """取单个项目元数据(供详情页用,带 git 信息)。"""
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(404, "项目不存在")
    branch, dirty = _git_meta(proj.path)
    return {
        "id": proj.id, "name": proj.name, "path": proj.path,
        "tech_stack": proj.tech_stack or [], "description": proj.description or "",
        "last_modified": proj.last_modified.isoformat() if proj.last_modified else None,
        "git_branch": branch or proj.git_branch,
        "git_dirty": dirty,
    }


@router.post("/rescan")
async def rescan(db: AsyncSession = Depends(get_session)):
    """扫描 WORKSPACE_ROOT + EXTRA_SCAN_ROOTS 下的所有子目录,识别项目并写库。

    同时填充 git_branch / git_dirty(如果项目是 git 仓库)。
    EXTRA_SCAN_ROOTS 用于让工作台审查它自己的代码(在 .env 配置)。
    """
    roots = [Path(r) for r in settings.extra_scan_roots_list if Path(r).is_dir()]
    if not roots:
        raise HTTPException(404, f"无可用工作区根: {settings.workspace_root}")
    found = []
    for root in roots:
        try:
            for entry in root.iterdir():
                if not entry.is_dir():
                    continue
                if entry.name in WORKSPACE_IGNORE_DIRS or entry.name.startswith("."):
                    continue
                stat = entry.stat()
                branch, dirty = _git_meta(str(entry))
                found.append({
                    "name": entry.name,
                    "path": str(entry),
                    "tech_stack": detect_stack(entry),
                    "last_modified": datetime.datetime.fromtimestamp(stat.st_mtime),
                    "git_branch": branch,
                    "git_dirty": dirty,
                })
        except (PermissionError, OSError) as e:
            logger.warning(f"跳过无权限目录 {root}: {e}")
            continue
    # 按 name 去重(多根同名时取第一个)
    seen = set()
    unique = []
    for item in found:
        if item["name"] not in seen:
            seen.add(item["name"])
            unique.append(item)
    found = unique
    upserted = 0
    for item in found:
        row = (await db.execute(select(Project).where(Project.name == item["name"]))).scalar_one_or_none()
        if row:
            row.path = item["path"]
            row.tech_stack = item["tech_stack"]
            row.last_modified = item["last_modified"]
            row.git_branch = item["git_branch"]
            row.git_dirty = item["git_dirty"]
        else:
            db.add(Project(**item))
            upserted += 1
    await db.commit()
    git_count = sum(1 for it in found if it["git_branch"])
    logger.info("扫描完成: 发现 %d 个项目, 新增 %d, git 仓库 %d 个" % (len(found), upserted, git_count))
    return {"found": len(found), "new": upserted, "git_count": git_count, "scanned_roots": [str(r) for r in roots]}


# ---- 目录树 ----

@router.get("/{project_id}/tree")
async def project_tree(
    project_id: int, path: str = "", max_depth: int = 3,
    db: AsyncSession = Depends(get_session),
):
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(404, "项目不存在")
    try:
        root = safe_resolve(Path(proj.path) / path) if path else Path(proj.path).resolve()
    except PathSandboxError as e:
        raise HTTPException(403, str(e))
    if not root.is_dir():
        raise HTTPException(404, f"目录不存在: {path}")
    tree = _build_tree(root, max_depth=max_depth, current_depth=0)
    return {"project": proj.name, "path": path or ".", "tree": tree}


def _build_tree(root, max_depth, current_depth, rel_prefix=""):
    """递归构造目录树。

    rel_prefix: 累积的相对项目根路径(用于在 name 字段里拼接,前端可直接用作 path 参数)。
    最外层节点(current_depth=0)的 name 用 "" — 避免前端拼接路径时重复加项目名前缀。
    """
    # 最外层 name="" — 前端 TreeView 把它当 root 处理,不参与 path 拼接
    rel = "" if current_depth == 0 else (root.name or str(root))
    node = {"name": rel, "type": "directory", "children": []}
    if current_depth >= max_depth:
        return node
    try:
        for entry in sorted(root.iterdir(), key=lambda p: (p.is_file(), p.name.lower())):
            if entry.name in WORKSPACE_IGNORE_DIRS or entry.name.startswith("."):
                continue
            if entry.is_dir():
                child_prefix = (rel_prefix + "/" + entry.name) if rel_prefix else entry.name
                node["children"].append(_build_tree(entry, max_depth, current_depth + 1, child_prefix))
            else:
                # 文件节点 name 也用纯 basename,前端在调用 readFile 时会拼上 currentPath
                node["children"].append({"name": entry.name, "type": "file", "size": entry.stat().st_size})
    except PermissionError:
        pass
    return node


# ---- 平铺列目录 ----

@router.get("/{project_id}/list")
async def project_list(
    project_id: int, path: str = "", db: AsyncSession = Depends(get_session),
):
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(404, "项目不存在")
    proj_path = Path(proj.path).resolve()
    target = (proj_path / path).resolve() if path else proj_path
    try:
        target.relative_to(proj_path)
    except ValueError:
        raise HTTPException(403, f"路径超出项目范围: {path}")
    return {"path": path or ".", "entries": list_dir(str(target))}


from fastapi.responses import JSONResponse
# ---- 文件读取 ----

@router.get("/{project_id}/file")
async def read_file(project_id: int, path: str, db: AsyncSession = Depends(get_session)):
    """读取项目内文件(安全沙箱校验)。

    返回带 Cache-Control: no-store — 防止浏览器把临时 404 缓存住,
    修复后用户硬刷新就能看到内容。
    """
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(404, "项目不存在")
    proj_path = Path(proj.path).resolve()
    target = (proj_path / path).resolve()
    try:
        target.relative_to(proj_path)
    except ValueError:
        raise HTTPException(403, f"文件超出项目范围: {path}")
    try:
        content, size, truncated = read_text_file(str(target))
    except (FileNotFoundError, IsADirectoryError, PermissionError) as e:
        raise HTTPException(404 if isinstance(e, FileNotFoundError) else 403, str(e))
    return JSONResponse(
        {"path": path, "content": content, "size": size, "truncated": truncated},
        headers={"Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache"},
    )


# ---- 文件写入 ----

@router.put("/{project_id}/file")
async def write_file(
    project_id: int, req: FileWriteRequest,
    db: AsyncSession = Depends(get_session),
):
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(404, "项目不存在")
    proj_path = Path(proj.path).resolve()
    target = (proj_path / req.path).resolve()
    try:
        target.relative_to(proj_path)
    except ValueError:
        raise HTTPException(403, f"文件超出项目范围: {req.path}")
