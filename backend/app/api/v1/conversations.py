"""会话历史 API。"""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.db.models.conversation import Conversation, Message
from app.schemas.conversation import ConversationOut, ConversationWithMessages, MessageOut

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("", response_model=list[ConversationOut])
async def list_conversations(
    agent_id: int | None = None,
    project_id: int | None = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_session),
):
    stmt = select(
        Conversation,
        func.count(Message.id).label("msg_count"),
    ).outerjoin(Message, Message.conversation_id == Conversation.id)
    if agent_id:
        stmt = stmt.where(Conversation.agent_id == agent_id)
    if project_id:
        stmt = stmt.where(Conversation.project_id == project_id)
    stmt = stmt.group_by(Conversation.id).order_by(desc(Conversation.updated_at)).limit(limit)
    rows = (await db.execute(stmt)).all()
    return [
        ConversationOut(
            id=c.id, agent_id=c.agent_id, title=c.title,
            project_id=c.project_id, requirement_id=c.requirement_id,
            created_at=c.created_at, updated_at=c.updated_at,
            message_count=mc,
        )
        for c, mc in rows
    ]


@router.get("/{conv_id}", response_model=ConversationWithMessages)
async def get_conversation(conv_id: int, db: AsyncSession = Depends(get_session)):
    conv = await db.get(Conversation, conv_id)
    if not conv:
        raise HTTPException(404, "会话不存在")
    msgs = (await db.execute(
        select(Message).where(Message.conversation_id == conv_id).order_by(Message.id)
    )).scalars().all()
    return ConversationWithMessages(
        id=conv.id, agent_id=conv.agent_id, title=conv.title,
        project_id=conv.project_id, requirement_id=conv.requirement_id,
        created_at=conv.created_at, updated_at=conv.updated_at,
        message_count=len(msgs),
        messages=[
            MessageOut(
                id=m.id, conversation_id=m.conversation_id, role=m.role,
                content=m.content, tokens_in=m.tokens_in, tokens_out=m.tokens_out,
                created_at=m.created_at,
            ) for m in msgs
        ],
    )


@router.delete("/{conv_id}", status_code=204)
async def delete_conversation(conv_id: int, db: AsyncSession = Depends(get_session)):
    conv = await db.get(Conversation, conv_id)
    if not conv:
        raise HTTPException(404, "会话不存在")
    # 先删消息
    msgs = (await db.execute(
        select(Message).where(Message.conversation_id == conv_id)
    )).scalars().all()
    for m in msgs:
        await db.delete(m)
    await db.delete(conv)
    await db.commit()


@router.get("/{conv_id}/export", response_class=PlainTextResponse)
async def export_conversation(conv_id: int, db: AsyncSession = Depends(get_session)):
    """导出为 Markdown。"""
    conv = await db.get(Conversation, conv_id)
    if not conv:
        raise HTTPException(404, "会话不存在")
    msgs = (await db.execute(
        select(Message).where(Message.conversation_id == conv_id).order_by(Message.id)
    )).scalars().all()
    lines = [f"# {conv.title}", "", f"> 导出时间:{conv.updated_at}", ""]
    for m in msgs:
        role_label = {"user": "👤 用户", "assistant": "🤖 助手", "system": "⚙️ 系统", "tool": "🔧 工具"}.get(m.role, m.role)
        lines.append(f"## {role_label}")
        lines.append("")
        lines.append(m.content)
        lines.append("")
    return "\n".join(lines)