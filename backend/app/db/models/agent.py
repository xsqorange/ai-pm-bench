"""Agent 配置:多供应商、多模型。"""
from __future__ import annotations
from sqlalchemy import String, Float, Boolean, JSON, Text, Integer
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, TimestampMixin


class AgentConfig(Base, TimestampMixin):
    __tablename__ = "agent_configs"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    provider: Mapped[str] = mapped_column(String(32))           # deepseek / kimi / MiniMax
    model: Mapped[str] = mapped_column(String(128))
    base_url: Mapped[str] = mapped_column(String(512))
    api_key_enc: Mapped[str] = mapped_column(Text)              # Fernet 加密
    temperature: Mapped[float] = mapped_column(Float, default=0.7)
    max_tokens: Mapped[int] = mapped_column(Integer, default=4096)
    system_prompt: Mapped[str] = mapped_column(Text, default="")
    extra: Mapped[dict] = mapped_column(JSON, default=dict)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    description: Mapped[str] = mapped_column(String(255), default="")