"""Git 相关 DTO。"""
from pydantic import BaseModel, Field


class BranchCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128, pattern=r"^[A-Za-z0-9._/-]+$")
    checkout: bool = True


class BranchCheckout(BaseModel):
    name: str


class CommitRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    add_all: bool = True


class RemoteRequest(BaseModel):
    remote: str = "origin"
    branch: str | None = None