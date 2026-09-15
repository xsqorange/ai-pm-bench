"""项目元数据 + 扫描结果缓存。"""
from __future__ import annotations
from datetime import datetime
from sqlalchemy import String, Boolean, JSON, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, TimestampMixin


class Project(Base, TimestampMixin):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    path: Mapped[str] = mapped_column(String(512))
    tech_stack: Mapped[list] = mapped_column(JSON, default=list)
    description: Mapped[str] = mapped_column(Text, default="")
    last_modified: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    git_branch: Mapped[str | None] = mapped_column(String(128), nullable=True)
    git_dirty: Mapped[bool] = mapped_column(Boolean, default=False)
    extra: Mapped[dict] = mapped_column(JSON, default=dict)