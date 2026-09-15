"""诊断端点 — 用于排查代理 / CORS / 请求体解析问题。"""
from __future__ import annotations
from fastapi import APIRouter, Request
from app.core.logger import logger

router = APIRouter(prefix="/debug", tags=["debug"])


@router.get("/ping")
async def ping(request: Request):
    """基础连通测试。"""
    return {
        "ok": True,
        "method": request.method,
        "url": str(request.url),
        "headers": {k: v for k, v in request.headers.items() if k.lower() not in ("authorization", "cookie")},
    }


@router.post("/echo")
async def echo(request: Request):
    """回显请求体 — 排查 Next.js 代理是否能正确转发 body。"""
    try:
        body = await request.json()
    except Exception as e:
        body = {"_error": f"无法解析 JSON: {e}"}
    return {
        "ok": True,
        "received": body,
        "content_type": request.headers.get("content-type"),
        "content_length": request.headers.get("content-length"),
    }