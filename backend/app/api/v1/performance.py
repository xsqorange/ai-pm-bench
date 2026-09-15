"""性能分析 API。"""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.db.models.performance import PerformanceReport
from app.schemas.review import PerfRunRequest, PerfOut, PerfDetail
from app.services.workspace.perf_analyzer import run_perf_analysis
from app.core.logger import logger

router = APIRouter(prefix="/performance", tags=["performance"])


@router.get("", response_model=list[PerfOut])
async def list_perf(
    project_id: int | None = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_session),
):
    stmt = select(PerformanceReport).order_by(desc(PerformanceReport.created_at)).limit(limit)
    if project_id:
        stmt = stmt.where(PerformanceReport.project_id == project_id)
    rows = (await db.execute(stmt)).scalars().all()
    return [_to_out(r) for r in rows]


@router.post("/run", response_model=PerfOut)
async def run(payload: PerfRunRequest, db: AsyncSession = Depends(get_session)):
    try:
        row = await run_perf_analysis(
            db,
            project_id=payload.project_id,
            agent_id=payload.agent_id,
            paths=payload.paths,
            max_chars=payload.max_chars,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.exception("性能分析失败")
        raise HTTPException(500, f"性能分析失败: {e}")
    return _to_out(row)


@router.get("/{perf_id}", response_model=PerfDetail)
async def get_perf(perf_id: int, db: AsyncSession = Depends(get_session)):
    row = await db.get(PerformanceReport, perf_id)
    if not row:
        raise HTTPException(404, "分析记录不存在")
    out = _to_out(row).model_dump()
    out["raw_llm"] = row.raw_text or ""  # 真实返回 LLM 原始输出
    return out


@router.delete("/{perf_id}", status_code=204)
async def delete_perf(perf_id: int, db: AsyncSession = Depends(get_session)):
    row = await db.get(PerformanceReport, perf_id)
    if not row:
        raise HTTPException(404, "分析记录不存在")
    await db.delete(row)
    await db.commit()


def _to_out(r: PerformanceReport) -> PerfOut:
    return PerfOut(
        id=r.id,
        project_id=r.project_id,
        agent_id=r.agent_id,
        scope=r.scope,
        summary=r.summary,
        findings=r.findings or [],
        static_findings=r.static_findings or [],
        created_at=r.created_at,
    )