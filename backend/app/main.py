"""AI Workbench 后端入口。"""
from __future__ import annotations
import traceback
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.core.logger import logger
from app.db.session import init_db
from app.api.router import api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"=== {settings.app_name} 启动 ===")
    logger.info(f"工作区根: {settings.workspace_root}")
    logger.info(f"数据目录: {settings.data_dir}")
    logger.info(f"DB URL: {settings.database_url.split('@')[-1]}")  # 不打印密码
    await init_db()
    logger.info("后端就绪")
    yield
    logger.info(f"=== {settings.app_name} 关闭 ===")


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="本地 AI 开发工作台",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins + ["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_prefix)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """全局异常处理:打印完整堆栈,返回结构化错误。"""
    tb = traceback.format_exc()
    logger.error(f"[500] {request.method} {request.url.path}\n{tb}")
    return JSONResponse(
        status_code=500,
        content={
            "detail": f"{type(exc).__name__}: {exc}",
            "type": type(exc).__name__,
            "path": request.url.path,
        },
    )


@app.get("/")
async def root():
    return {
        "name": settings.app_name,
        "version": "0.1.0",
        "workspace": settings.workspace_root,
        "api_docs": "/docs",
        "api_prefix": settings.api_prefix,
    }


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8000,
        reload=False,  # 生产模式启动,避免 --reload 的子进程问题
    )