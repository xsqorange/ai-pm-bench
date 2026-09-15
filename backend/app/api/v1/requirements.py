"""需求 + 子任务 API。"""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.db.models.requirement import Requirement, Subtask
from app.schemas.requirement import (
    RequirementCreate, RequirementUpdate, RequirementOut,
    SubtaskCreate, SubtaskUpdate, SubtaskOut,
    GenerateSolutionRequest, DecomposeRequest,
)
from app.services.requirements import generate_solution, decompose_subtasks
from app.core.logger import logger

router = APIRouter(prefix="/requirements", tags=["requirements"])


def _req_to_out(r: Requirement, subtask_count: int) -> RequirementOut:
    return RequirementOut(
        id=r.id, title=r.title, description=r.description,
        status=r.status, priority=r.priority,
        project_ids=r.project_ids or [], solution_doc=r.solution_doc or "",
        tags=r.tags or [],
        created_at=r.created_at, updated_at=r.updated_at,
        subtask_count=subtask_count,
    )


@router.get("", response_model=list[RequirementOut])
async def list_requirements(
    status: str | None = Query(None, pattern="^(todo|doing|done|blocked)$"),
    project_id: int | None = None,
    db: AsyncSession = Depends(get_session),
):
    stmt = select(
        Requirement,
        func.count(Subtask.id).label("st_count"),
    ).outerjoin(Subtask, Subtask.requirement_id == Requirement.id)
    if status:
        stmt = stmt.where(Requirement.status == status)
    if project_id is not None:
        stmt = stmt.where(Requirement.project_ids.contains([project_id]))
    stmt = stmt.group_by(Requirement.id).order_by(Requirement.updated_at.desc())
    rows = (await db.execute(stmt)).all()
    return [_req_to_out(r, sc) for r, sc in rows]


@router.post("", response_model=RequirementOut, status_code=201)
async def create_requirement(payload: RequirementCreate, db: AsyncSession = Depends(get_session)):
    row = Requirement(
        title=payload.title,
        description=payload.description,
        status=payload.status,
        priority=payload.priority,
        project_ids=payload.project_ids,
        tags=payload.tags,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _req_to_out(row, 0)


@router.get("/{req_id}", response_model=RequirementOut)
async def get_requirement(req_id: int, db: AsyncSession = Depends(get_session)):
    row = await db.get(Requirement, req_id)
    if not row:
        raise HTTPException(404, "需求不存在")
    count = (await db.execute(
        select(func.count(Subtask.id)).where(Subtask.requirement_id == req_id)
    )).scalar()
    return _req_to_out(row, count or 0)


@router.patch("/{req_id}", response_model=RequirementOut)
async def update_requirement(req_id: int, payload: RequirementUpdate, db: AsyncSession = Depends(get_session)):
    row = await db.get(Requirement, req_id)
    if not row:
        raise HTTPException(404, "需求不存在")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(row, k, v)
    await db.commit()
    await db.refresh(row)
    count = (await db.execute(
        select(func.count(Subtask.id)).where(Subtask.requirement_id == req_id)
    )).scalar()
    return _req_to_out(row, count or 0)


@router.delete("/{req_id}", status_code=204)
async def delete_requirement(req_id: int, db: AsyncSession = Depends(get_session)):
    row = await db.get(Requirement, req_id)
    if not row:
        raise HTTPException(404, "需求不存在")
    # 删子任务
    subs = (await db.execute(select(Subtask).where(Subtask.requirement_id == req_id))).scalars().all()
    for s in subs:
        await db.delete(s)
    await db.delete(row)
    await db.commit()


@router.post("/{req_id}/solution")
async def post_solution(req_id: int, payload: GenerateSolutionRequest, db: AsyncSession = Depends(get_session)):
    try:
        md = await generate_solution(db, req_id, payload.agent_id)
        return {"solution_doc": md, "chars": len(md)}
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        logger.exception("生成方案失败")
        raise HTTPException(500, f"生成失败: {e}")


@router.post("/{req_id}/decompose", response_model=list[SubtaskOut])
async def post_decompose(req_id: int, payload: DecomposeRequest, db: AsyncSession = Depends(get_session)):
    try:
        created = await decompose_subtasks(db, req_id, payload.agent_id, payload.count)
        return [
            SubtaskOut(
                id=s.id, requirement_id=s.requirement_id, project_id=s.project_id,
                module=s.module, title=s.title, description=s.description,
                status=s.status, estimate_hours=s.estimate_hours,
            )
            for s in created
        ]
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        logger.exception("拆子任务失败")
        raise HTTPException(500, f"拆解失败: {e}")


# ---- Subtasks ----

@router.get("/{req_id}/subtasks", response_model=list[SubtaskOut])
async def list_subtasks(req_id: int, db: AsyncSession = Depends(get_session)):
    rows = (await db.execute(
        select(Subtask).where(Subtask.requirement_id == req_id).order_by(Subtask.id)
    )).scalars().all()
    return [
        SubtaskOut(
            id=s.id, requirement_id=s.requirement_id, project_id=s.project_id,
            module=s.module, title=s.title, description=s.description,
            status=s.status, estimate_hours=s.estimate_hours,
        )
        for s in rows
    ]


@router.post("/{req_id}/subtasks", response_model=SubtaskOut, status_code=201)
async def create_subtask(req_id: int, payload: SubtaskCreate, db: AsyncSession = Depends(get_session)):
    req = await db.get(Requirement, req_id)
    if not req:
        raise HTTPException(404, "需求不存在")
    s = Subtask(
        requirement_id=req_id,
        project_id=payload.project_id,
        module=payload.module,
        title=payload.title,
        description=payload.description,
        status=payload.status,
        estimate_hours=payload.estimate_hours,
    )
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return SubtaskOut(
        id=s.id, requirement_id=s.requirement_id, project_id=s.project_id,
        module=s.module, title=s.title, description=s.description,
        status=s.status, estimate_hours=s.estimate_hours,
    )


@router.patch("/{req_id}/subtasks/{sub_id}", response_model=SubtaskOut)
async def update_subtask(req_id: int, sub_id: int, payload: SubtaskUpdate, db: AsyncSession = Depends(get_session)):
    s = await db.get(Subtask, sub_id)
    if not s or s.requirement_id != req_id:
        raise HTTPException(404, "子任务不存在")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(s, k, v)
    await db.commit()
    await db.refresh(s)
    return SubtaskOut(
        id=s.id, requirement_id=s.requirement_id, project_id=s.project_id,
        module=s.module, title=s.title, description=s.description,
        status=s.status, estimate_hours=s.estimate_hours,
    )


@router.delete("/{req_id}/subtasks/{sub_id}", status_code=204)
async def delete_subtask(req_id: int, sub_id: int, db: AsyncSession = Depends(get_session)):
    s = await db.get(Subtask, sub_id)
    if not s or s.requirement_id != req_id:
        raise HTTPException(404, "子任务不存在")
    await db.delete(s)
    await db.commit()