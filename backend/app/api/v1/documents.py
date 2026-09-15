"""文档管理 API。"""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.db.models.document import Document
from app.schemas.review import (
    DocumentCreate, DocumentUpdate, DocumentOut,
    DocumentGenerateRequest, DocumentPolishRequest,
)
from app.services.documents import generate_document, polish_document
from app.core.logger import logger

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("", response_model=list[DocumentOut])
async def list_documents(
    project_id: int | None = None,
    type: str | None = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_session),
):
    stmt = select(Document).order_by(desc(Document.updated_at)).limit(limit)
    if project_id:
        stmt = stmt.where(Document.project_id == project_id)
    if type:
        stmt = stmt.where(Document.type == type)
    rows = (await db.execute(stmt)).scalars().all()
    return [_to_out(r) for r in rows]


@router.post("", response_model=DocumentOut, status_code=201)
async def create_document(payload: DocumentCreate, db: AsyncSession = Depends(get_session)):
    row = Document(
        project_id=payload.project_id,
        title=payload.title,
        type=payload.type,
        content=payload.content,
        tags=payload.tags,
        file_path=payload.file_path,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _to_out(row)


@router.get("/{doc_id}", response_model=DocumentOut)
async def get_document(doc_id: int, db: AsyncSession = Depends(get_session)):
    row = await db.get(Document, doc_id)
    if not row:
        raise HTTPException(404, "文档不存在")
    return _to_out(row)


@router.patch("/{doc_id}", response_model=DocumentOut)
async def update_document(doc_id: int, payload: DocumentUpdate, db: AsyncSession = Depends(get_session)):
    row = await db.get(Document, doc_id)
    if not row:
        raise HTTPException(404, "文档不存在")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(row, k, v)
    await db.commit()
    await db.refresh(row)
    return _to_out(row)


@router.delete("/{doc_id}", status_code=204)
async def delete_document(doc_id: int, db: AsyncSession = Depends(get_session)):
    row = await db.get(Document, doc_id)
    if not row:
        raise HTTPException(404, "文档不存在")
    await db.delete(row)
    await db.commit()


@router.post("/{doc_id}/polish", response_model=DocumentOut)
async def polish(doc_id: int, payload: DocumentPolishRequest, db: AsyncSession = Depends(get_session)):
    try:
        row = await polish_document(db, doc_id, payload.agent_id, payload.instruction)
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        logger.exception("文档润色失败")
        raise HTTPException(500, f"润色失败: {e}")
    return _to_out(row)


@router.post("/generate", response_model=DocumentOut, status_code=201)
async def generate(payload: DocumentGenerateRequest, db: AsyncSession = Depends(get_session)):
    try:
        row = await generate_document(db, payload.project_id, payload.agent_id, payload.doc_type)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.exception("文档生成失败")
        raise HTTPException(500, f"生成失败: {e}")
    return _to_out(row)


@router.get("/{doc_id}/export", response_class=PlainTextResponse)
async def export_markdown(doc_id: int, db: AsyncSession = Depends(get_session)):
    row = await db.get(Document, doc_id)
    if not row:
        raise HTTPException(404, "文档不存在")
    return PlainTextResponse(
        content=row.content,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{row.title}.md"'},
    )


def _to_out(r: Document) -> DocumentOut:
    return DocumentOut(
        id=r.id,
        project_id=r.project_id,
        title=r.title,
        type=r.type,
        content=r.content,
        tags=r.tags or [],
        file_path=r.file_path,
        created_at=r.created_at,
        updated_at=r.updated_at,
    )