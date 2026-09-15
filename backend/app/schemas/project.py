"""项目相关 DTO。"""
from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel


class ProjectOut(BaseModel):
    id: int
    name: str
    path: str
    tech_stack: list[str]
    description: str
    last_modified: datetime | None
    git_branch: str | None
    git_dirty: bool


class FileReadResult(BaseModel):
    path: str
    content: str
    size: int
    truncated: bool


class FileWriteRequest(BaseModel):
    """写入文件:必须提供原内容用于二次确认(若不同则拒绝)。"""
    path: str
    content: str
    expected_original: str | None = None  # 客户端传当前文件内容,服务端校验一致才写
    confirm: bool = False                   # 必须显式 True