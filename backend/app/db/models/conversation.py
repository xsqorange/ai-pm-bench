"""会话与消息:多轮上下文。"""
from __future__ import annotations
from sqlalchemy import String, Integer, Text, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, TimestampMixin


class Conversation(Base, TimestampMixin):
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agent_configs.id"), index=True)
    title: Mapped[str] = mapped_column(String(255), default="新会话")
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id"), nullable=True, index=True
    )
    requirement_id: Mapped[int | None] = mapped_column(
        ForeignKey("requirements.id"), nullable=True, index=True
    )
    meta: Mapped[dict] = mapped_column(JSON, default=dict)


class Message(Base, TimestampMixin):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(16))                # system/user/assistant/tool
    content: Mapped[str] = mapped_column(Text)
    tokens_in: Mapped[int] = mapped_column(Integer, default=0)
    tokens_out: Mapped[int] = mapped_column(Integer, default=0)
    tool_calls: Mapped[list] = mapped_column(JSON, default=list)