"""Agent 调度:从 DB 读 AgentConfig → 解密 key → 调对应 Adapter。"""
from __future__ import annotations
from typing import AsyncIterator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models.agent import AgentConfig
from app.core.security import decrypt
from app.core.logger import logger
from .base import ChatMessage
from .registry import build_adapter


async def get_adapter(db: AsyncSession, agent_id: int):
    row = (await db.execute(
        select(AgentConfig).where(AgentConfig.id == agent_id)
    )).scalar_one_or_none()
    if row is None:
        raise ValueError(f"Agent 不存在: id={agent_id}")
    if not row.enabled:
        raise ValueError(f"Agent 已禁用: {row.name}")
    api_key = decrypt(row.api_key_enc)
    return build_adapter(
        provider=row.provider,
        api_key=api_key,
        base_url=row.base_url,
        model=row.model,
    ), row


async def stream_chat(
    db: AsyncSession,
    agent_id: int,
    messages: list[ChatMessage],
    temperature: float | None = None,
    max_tokens: int | None = None,
) -> AsyncIterator[tuple[str, AgentConfig]]:
    """流式生成。每次 yield (content_chunk, agent_config)。"""
    adapter, agent = await get_adapter(db, agent_id)
    sys_prompt = agent.system_prompt or "你是一名资深软件工程师,助手。"
    full: list[ChatMessage] = [{"role": "system", "content": sys_prompt}, *messages]
    logger.info(f"[chat] agent={agent.name} model={agent.model} msgs={len(full)}")
    async for chunk in adapter.stream_chat(
        full,
        temperature=temperature if temperature is not None else agent.temperature,
        max_tokens=max_tokens if max_tokens is not None else agent.max_tokens,
    ):
        yield chunk, agent