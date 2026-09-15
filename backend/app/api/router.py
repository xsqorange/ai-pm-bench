"""汇总 v1 路由。"""
from fastapi import APIRouter
from app.api.v1 import (
    agents, chat, projects, conversations, debug,
    git, requirements, reviews, performance, documents,
)

api_router = APIRouter()
api_router.include_router(agents.router)
api_router.include_router(chat.router)
api_router.include_router(projects.router)
api_router.include_router(conversations.router)
api_router.include_router(debug.router)
api_router.include_router(git.router)
api_router.include_router(requirements.router)
api_router.include_router(reviews.router)
api_router.include_router(performance.router)
api_router.include_router(documents.router)