"""性能分析报告。"""
from __future__ import annotations
from sqlalchemy import String, Text, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, TimestampMixin


class PerformanceReport(Base, TimestampMixin):
    __tablename__ = "performance_reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    agent_id: Mapped[int] = mapped_column(ForeignKey("agent_configs.id"))
    scope: Mapped[str] = mapped_column(String(512))
    summary: Mapped[str] = mapped_column(Text, default="")
    findings: Mapped[list] = mapped_column(JSON, default=list)
    static_findings: Mapped[list] = mapped_column(JSON, default=list)
    raw_text: Mapped[str] = mapped_column(Text, default="")  # LLM 原始输出(用于调试 / 排查解析失败)
    raw_text: Mapped[str] = mapped_column(Text, default="")  # LLM 原始输出(用于调试 / 排查解析失败)