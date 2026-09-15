"""Git 操作 API。"""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.db.models.project import Project
from app.services.workspace import git_ops
from app.schemas.git import BranchCreate, BranchCheckout, CommitRequest, RemoteRequest
from app.core.logger import logger

router = APIRouter(prefix="/projects/{project_id}/git", tags=["git"])


async def _project(db: AsyncSession, project_id: int) -> Project:
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(404, "项目不存在")
    return proj


@router.get("/status")
async def get_status(project_id: int, db: AsyncSession = Depends(get_session)):
    proj = await _project(db, project_id)
    try:
        return git_ops.status_of(proj.path)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/log")
async def get_log(project_id: int, max_count: int = 20, db: AsyncSession = Depends(get_session)):
    proj = await _project(db, project_id)
    try:
        return {"commits": git_ops.log_of(proj.path, max_count=max_count)}
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/diff")
async def get_diff(
    project_id: int,
    path: str | None = None,
    staged: bool = False,
    db: AsyncSession = Depends(get_session),
):
    proj = await _project(db, project_id)
    try:
        diff_text = git_ops.diff_of(proj.path, file_path=path, staged=staged)
        return {"diff": diff_text, "path": path, "staged": staged}
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/branches")
async def list_branches(project_id: int, db: AsyncSession = Depends(get_session)):
    proj = await _project(db, project_id)
    try:
        return git_ops.branches_of(proj.path)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/branches")
async def create_branch(project_id: int, payload: BranchCreate, db: AsyncSession = Depends(get_session)):
    proj = await _project(db, project_id)
    try:
        name = git_ops.create_branch(proj.path, payload.name, checkout=payload.checkout)
        return {"branch": name, "checkout": payload.checkout}
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/checkout")
async def checkout(project_id: int, payload: BranchCheckout, db: AsyncSession = Depends(get_session)):
    proj = await _project(db, project_id)
    try:
        name = git_ops.checkout_branch(proj.path, payload.name)
        return {"branch": name}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.exception("git checkout 失败")
        raise HTTPException(500, str(e))


@router.post("/commit")
async def commit(project_id: int, payload: CommitRequest, db: AsyncSession = Depends(get_session)):
    proj = await _project(db, project_id)
    try:
        result = git_ops.commit_changes(proj.path, payload.message, payload.add_all)
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.exception("git commit 失败")
        raise HTTPException(500, str(e))


@router.post("/push")
async def push(project_id: int, payload: RemoteRequest, db: AsyncSession = Depends(get_session)):
    proj = await _project(db, project_id)
    try:
        result = git_ops.push_remote(proj.path, payload.remote, payload.branch)
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.exception("git push 失败")
        raise HTTPException(500, f"push 失败: {e}")


@router.post("/pull")
async def pull(project_id: int, payload: RemoteRequest, db: AsyncSession = Depends(get_session)):
    proj = await _project(db, project_id)
    try:
        result = git_ops.pull_remote(proj.path, payload.remote, payload.branch)
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.exception("git pull 失败")
        raise HTTPException(500, f"pull 失败: {e}")