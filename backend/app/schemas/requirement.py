"""需求 + 子任务 DTO。"""
from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel, Field


class RequirementCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str = Field("", max_length=20000)
    status: str = Field("todo", pattern="^(todo|doing|done|blocked)$")
    priority: str = Field("P1", pattern="^P[0-3]$")
    project_ids: list[int] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)


class RequirementUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = Field(None, pattern="^(todo|doing|done|blocked)$")
    priority: str | None = Field(None, pattern="^P[0-3]$")
    project_ids: list[int] | None = None
    tags: list[str] | None = None
    solution_doc: str | None = None


class RequirementOut(BaseModel):
    id: int
    title: str
    description: str
    status: str
    priority: str
    project_ids: list[int]
    solution_doc: str
    tags: list[str]
    created_at: datetime
    updated_at: datetime
    subtask_count: int = 0


class SubtaskCreate(BaseModel):
    project_id: int | None = None
    module: str = Field("", max_length=128)
    title: str = Field(..., min_length=1, max_length=255)
    description: str = Field("", max_length=20000)
    status: str = Field("todo", pattern="^(todo|doing|done|blocked)$")
    estimate_hours: float = Field(0.0, ge=0)


class SubtaskUpdate(BaseModel):
    project_id: int | None = None
    module: str | None = None
    title: str | None = None
    description: str | None = None
    status: str | None = Field(None, pattern="^(todo|doing|done|blocked)$")
    estimate_hours: float | None = None


class SubtaskOut(BaseModel):
    id: int
    requirement_id: int
    project_id: int | None
    module: str
    title: str
    description: str
    status: str
    estimate_hours: float


class GenerateSolutionRequest(BaseModel):
    agent_id: int


class DecomposeRequest(BaseModel):
    agent_id: int
    count: int = Field(5, ge=1, le=20)