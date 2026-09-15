"""代码审查 API。"""
from __future__ import annotations
import asyncio
import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.db.models.review import ReviewReport
from app.schemas.review import ReviewRunRequest, ReviewOut, ReviewDetail
from app.services.workspace.reviewer import run_review
from app.core.logger import logger

router = APIRouter(prefix="/reviews", tags=["reviews"])


@router.get("", response_model=list[ReviewOut])
async def list_reviews(
    project_id: int | None = None,
    severity: str | None = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_session),
):
    stmt = select(ReviewReport).order_by(desc(ReviewReport.created_at)).limit(limit)
    if project_id:
        stmt = stmt.where(ReviewReport.project_id == project_id)
    if severity:
        stmt = stmt.where(ReviewReport.severity == severity)
    rows = (await db.execute(stmt)).scalars().all()
    return [_to_out(r) for r in rows]


@router.post("/run", response_model=ReviewOut)
async def run(payload: ReviewRunRequest, db: AsyncSession = Depends(get_session)):
    try:
        row = await run_review(
            db,
            project_id=payload.project_id,
            agent_id=payload.agent_id,
            paths=payload.paths,
            max_chars=payload.max_chars,
            categories=payload.categories,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.exception("审查失败")
        raise HTTPException(500, f"审查失败: {e}")
    return _to_out(row)


@router.post("/run/stream")
async def run_stream(payload: ReviewRunRequest, db: AsyncSession = Depends(get_session)):
    """实时审查流 — Server-Sent Events。

    每个阶段完成后立即推送一条 `event: trajectory` 事件,前端可实时绘制 timeline。
    完成后推送 `event: done` + review_id。
    """
    queue: asyncio.Queue = asyncio.Queue()

    async def gen():
        # 立即推一个 start 事件,前端可立即显示 "审查中"
        yield "event: start\ndata: " + json.dumps({
            "project_id": payload.project_id,
            "agent_id": payload.agent_id,
            "paths": payload.paths,
        }, ensure_ascii=False) + "\n\n"

        async def runner():
            try:
                row = await run_review(
                    db,
                    project_id=payload.project_id,
                    agent_id=payload.agent_id,
                    paths=payload.paths,
                    max_chars=payload.max_chars,
                    categories=payload.categories,
                    trajectory_queue=queue,
                )
                return row.id
            except Exception as e:
                # 失败也推一条 error 事件,让前端终止 loading
                await queue.put({
                    "_error": True,
                    "stage": "fatal",
                    "status": "error",
                    "payload": {"reason": str(e)},
                })
                return None

        runner_task = asyncio.create_task(runner())
        review_id = None
        while True:
            ev = await queue.get()
            if ev.get("_error"):
                yield "event: error\ndata: " + json.dumps(ev["payload"], ensure_ascii=False) + "\n\n"
                break
            yield "event: trajectory\ndata: " + json.dumps(ev, ensure_ascii=False) + "\n\n"
            if ev.get("stage") == "saved":
                review_id = ev.get("payload", {}).get("review_id")
                break

        review_id = review_id or await runner_task
        yield "event: done\ndata: " + json.dumps({
            "review_id": review_id,
            "ok": review_id is not None,
        }, ensure_ascii=False) + "\n\n"

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # 禁用 nginx buffering
            "Connection": "keep-alive",
        },
    )


@router.get("/{review_id}", response_model=ReviewDetail)
async def get_review(review_id: int, db: AsyncSession = Depends(get_session)):
    row = await db.get(ReviewReport, review_id)
    if not row:
        raise HTTPException(404, "审查记录不存在")
    out = _to_out(row).model_dump()
    out["raw_llm"] = row.raw_text or ""  # 真实返回 LLM 原始输出
    out["trajectory"] = row.trajectory or []  # 审查执行轨迹(timeline)
    return out


@router.delete("/{review_id}", status_code=204)
async def delete_review(review_id: int, db: AsyncSession = Depends(get_session)):
    row = await db.get(ReviewReport, review_id)
    if not row:
        raise HTTPException(404, "审查记录不存在")
    await db.delete(row)
    await db.commit()


def _to_out(r: ReviewReport) -> ReviewOut:
    return ReviewOut(
        id=r.id,
        project_id=r.project_id,
        agent_id=r.agent_id,
        scope=r.scope,
        summary=r.summary,
        findings=r.findings or [],
        severity=r.severity,
        rules=r.rules or {},
        created_at=r.created_at,
    )