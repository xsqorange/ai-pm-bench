"""会话与消息 DTO。"""
from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel


class MessageOut(BaseModel):
    id: int
    conversation_id: int
    role: str
    content: str
    tokens_in: int
    tokens_out: int
    created_at: datetime


class ConversationOut(BaseModel):
    id: int
    agent_id: int
    title: str
    project_id: int | None
    requirement_id: int | None
    created_at: datetime
    updated_at: datetime
    message_count: int = 0


class ConversationWithMessages(ConversationOut):
    messages: list[MessageOut] = []