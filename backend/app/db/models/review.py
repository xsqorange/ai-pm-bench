"""代码审查报告。"""
from __future__ import annotations
from sqlalchemy import String, Text, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, TimestampMixin


class ReviewReport(Base, TimestampMixin):
    __tablename__ = "review_reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    agent_id: Mapped[int] = mapped_column(ForeignKey("agent_configs.id"))
    scope: Mapped[str] = mapped_column(String(512))         # 文件/目录路径
    summary: Mapped[str] = mapped_column(Text, default="")
    severity: Mapped[str] = mapped_column(String(16), default="info")
    findings: Mapped[list] = mapped_column(JSON, default=list)
    rules: Mapped[dict] = mapped_column(JSON, default=dict)
    raw_text: Mapped[str] = mapped_column(Text, default="")  # LLM 原始输出(用于调试 / 排查解析失败)
    trajectory: Mapped[list] = mapped_column(JSON, default=list)  # 审查执行轨迹,每条 {ts, stage, status, payload}