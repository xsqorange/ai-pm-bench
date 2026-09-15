"""需求与子任务。"""
from __future__ import annotations
from sqlalchemy import String, Text, Float, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, TimestampMixin


class Requirement(Base, TimestampMixin):
    __tablename__ = "requirements"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255), index=True)
    description: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="todo")     # todo/doing/done/blocked
    priority: Mapped[str] = mapped_column(String(8), default="P1")      # P0/P1/P2/P3
    project_ids: Mapped[list] = mapped_column(JSON, default=list)        # 多项目关联
    solution_doc: Mapped[str] = mapped_column(Text, default="")
    tags: Mapped[list] = mapped_column(JSON, default=list)


class Subtask(Base, TimestampMixin):
    __tablename__ = "subtasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    requirement_id: Mapped[int] = mapped_column(
        ForeignKey("requirements.id", ondelete="CASCADE"), index=True
    )
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id"), nullable=True, index=True
    )
    module: Mapped[str] = mapped_column(String(128), default="")
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="todo")
    estimate_hours: Mapped[float] = mapped_column(Float, default=0)