"""代码审查 / 性能分析 DTO。"""
from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel, Field
from typing import Literal


class ReviewRunRequest(BaseModel):
    project_id: int
    agent_id: int
    paths: list[str] = Field(default_factory=list)   # 文件/目录相对路径列表
    max_chars: int = Field(60_000, ge=10_000, le=200_000)
    categories: list[str] = Field(
        default_factory=lambda: ["bug", "security", "perf", "smell", "maintainability"]
    )


class ReviewFinding(BaseModel):
    file: str
    line: int = 0
    severity: Literal["error", "warn", "info"] = "info"
    category: Literal["bug", "security", "perf", "smell", "maintainability"]
    title: str
    detail: str = ""
    suggestion: str = ""


class ReviewSummary(BaseModel):
    errors: int = 0
    warnings: int = 0
    infos: int = 0
    by_category: dict[str, int] = Field(default_factory=dict)


class ReviewOut(BaseModel):
    id: int
    project_id: int
    agent_id: int
    scope: str
    summary: str
    findings: list[dict]            # 列表中保持原始 dict 以便前端灵活展示
    severity: str
    rules: dict
    created_at: datetime


class ReviewDetail(ReviewOut):
    raw_llm: str = ""               # 模型原始输出(用于调试)
    trajectory: list[dict] = Field(default_factory=list)  # 审查执行轨迹(每个阶段一条事件)


class PerfRunRequest(BaseModel):
    project_id: int
    agent_id: int
    paths: list[str] = Field(default_factory=list)
    max_chars: int = Field(40_000, ge=5_000, le=150_000)


class PerfOut(BaseModel):
    id: int
    project_id: int
    agent_id: int
    scope: str
    summary: str
    findings: list[dict]
    static_findings: list[dict]
    created_at: datetime


class PerfDetail(PerfOut):
    raw_llm: str = ""


# = Document  =
class DocumentCreate(BaseModel):
    project_id: int | None = None
    title: str = Field(..., min_length=1, max_length=255)
    type: Literal["README", "API", "ARCH", "CHANGELOG", "DEPLOY", "OTHER"] = "README"
    content: str = Field("", max_length=200_000)
    tags: list[str] = Field(default_factory=list)
    file_path: str | None = None


class DocumentUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    tags: list[str] | None = None
    file_path: str | None = None


class DocumentOut(BaseModel):
    id: int
    project_id: int | None
    title: str
    type: str
    content: str
    tags: list[str]
    file_path: str | None
    created_at: datetime
    updated_at: datetime


class DocumentGenerateRequest(BaseModel):
    project_id: int
    agent_id: int
    doc_type: Literal["README", "API", "ARCH", "CHANGELOG", "DEPLOY"] = "README"


class DocumentPolishRequest(BaseModel):
    agent_id: int
    instruction: str = Field("", max_length=1000)