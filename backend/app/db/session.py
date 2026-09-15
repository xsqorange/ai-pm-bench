"""异步 SQLAlchemy 引擎与会话工厂。"""
from __future__ import annotations
from typing import AsyncIterator
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from app.config import settings
from app.core.logger import logger
from app.db.base import Base

engine = create_async_engine(
    settings.database_url,
    echo=settings.db_echo,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(
    engine,
    expire_on_commit=False,
    autoflush=False,
)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    """启动时调用:创建所有表(开发阶段使用,生产用 Alembic)。"""
    # 触发模型注册
    from app.db.models import (  # noqa: F401
        agent, conversation, project, requirement, review,
        performance, document,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("数据库表结构已同步")