"""项目文档。"""
from __future__ import annotations
from sqlalchemy import String, Text, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, TimestampMixin


class Document(Base, TimestampMixin):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(255))
    type: Mapped[str] = mapped_column(String(32))           # README/API/ARCH/CHANGELOG/DEPLOY/OTHER
    content: Mapped[str] = mapped_column(Text)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    file_path: Mapped[str | None] = mapped_column(String(512), nullable=True)