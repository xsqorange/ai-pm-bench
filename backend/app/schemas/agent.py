"""Agent / 对话相关 DTO。"""
from __future__ import annotations
from pydantic import BaseModel, Field


class AgentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)
    provider: str = Field(..., min_length=1, max_length=32)
    model: str = Field(..., min_length=1)
    base_url: str = Field("")
    api_key: str = Field(..., min_length=1)
    temperature: float = Field(0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(4096, ge=64, le=32768)
    system_prompt: str = Field("")
    description: str = Field("")
    extra: dict = Field(default_factory=dict)


class AgentUpdate(BaseModel):
    name: str | None = None
    provider: str | None = None
    model: str | None = None
    base_url: str | None = None
    api_key: str | None = None
    temperature: float | None = Field(None, ge=0.0, le=2.0)
    max_tokens: int | None = Field(None, ge=64, le=32768)
    system_prompt: str | None = None
    description: str | None = None
    enabled: bool | None = None
    extra: dict | None = None


class AgentOut(BaseModel):
    id: int
    name: str
    provider: str
    model: str
    base_url: str
    temperature: float
    max_tokens: int
    system_prompt: str
    description: str
    enabled: bool
    has_api_key: bool
    extra: dict