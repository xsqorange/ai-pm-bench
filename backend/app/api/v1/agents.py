"""Agent CRUD + 健康检查。"""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.db.models.agent import AgentConfig
from app.core.security import encrypt, decrypt
from app.core.logger import logger
from app.services.agents.registry import build_adapter, DEFAULT_BASE_URLS, normalize_provider
from app.schemas.agent import AgentCreate, AgentUpdate, AgentOut

router = APIRouter(prefix="/agents", tags=["agents"])


def _to_out(row: AgentConfig) -> AgentOut:
    return AgentOut(
        id=row.id,
        name=row.name,
        provider=row.provider,
        model=row.model,
        base_url=row.base_url,
        temperature=row.temperature,
        max_tokens=row.max_tokens,
        system_prompt=row.system_prompt,
        description=row.description,
        enabled=row.enabled,
        has_api_key=bool(row.api_key_enc),
        extra=row.extra or {},
    )


@router.get("", response_model=list[AgentOut])
async def list_agents(db: AsyncSession = Depends(get_session)):
    rows = (await db.execute(select(AgentConfig).order_by(AgentConfig.id))).scalars().all()
    return [_to_out(r) for r in rows]


@router.post("", response_model=AgentOut, status_code=status.HTTP_201_CREATED)
async def create_agent(payload: AgentCreate, db: AsyncSession = Depends(get_session)):
    logger.info(f"[POST /agents] name={payload.name} provider={payload.provider} model={payload.model}")
    norm = normalize_provider(payload.provider)
    base_url = payload.base_url or DEFAULT_BASE_URLS.get(norm, "")
    if not base_url:
        raise HTTPException(400, f"未提供 base_url 且无默认值: provider={payload.provider}")

    existing = (await db.execute(
        select(AgentConfig).where(AgentConfig.name == payload.name)
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(409, f"Agent 名称已存在: {payload.name}")

    row = AgentConfig(
        name=payload.name,
        provider=norm,             # 存规范化后的值
        model=payload.model,
        base_url=base_url,
        api_key_enc=encrypt(payload.api_key),
        temperature=payload.temperature,
        max_tokens=payload.max_tokens,
        system_prompt=payload.system_prompt,
        description=payload.description,
        extra=payload.extra or {},
    )
    db.add(row)
    try:
        await db.commit()
        await db.refresh(row)
    except IntegrityError as e:
        await db.rollback()
        logger.error(f"[POST /agents] IntegrityError: {e}")
        raise HTTPException(409, f"数据库约束冲突: {e.orig}")
    except Exception as e:
        await db.rollback()
        logger.exception("[POST /agents] DB error")
        raise HTTPException(500, f"数据库错误: {e}")

    logger.info(f"[POST /agents] OK - id={row.id} {row.name} ({row.provider}/{row.model})")
    return _to_out(row)


@router.get("/{agent_id}", response_model=AgentOut)
async def get_agent(agent_id: int, db: AsyncSession = Depends(get_session)):
    row = await db.get(AgentConfig, agent_id)
    if not row:
        raise HTTPException(404, "Agent 不存在")
    return _to_out(row)


@router.patch("/{agent_id}", response_model=AgentOut)
async def update_agent(agent_id: int, payload: AgentUpdate, db: AsyncSession = Depends(get_session)):
    row = await db.get(AgentConfig, agent_id)
    if not row:
        raise HTTPException(404, "Agent 不存在")
    data = payload.model_dump(exclude_unset=True)
    if "api_key" in data and data["api_key"]:
        row.api_key_enc = encrypt(data.pop("api_key"))
    if "provider" in data and data["provider"]:
        data["provider"] = normalize_provider(data["provider"])
    for k, v in data.items():
        setattr(row, k, v)
    await db.commit()
    await db.refresh(row)
    return _to_out(row)


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent(agent_id: int, db: AsyncSession = Depends(get_session)):
    row = await db.get(AgentConfig, agent_id)
    if not row:
        raise HTTPException(404, "Agent 不存在")
    await db.delete(row)
    await db.commit()
    return None


@router.post("/{agent_id}/test")
async def test_agent(agent_id: int, db: AsyncSession = Depends(get_session)):
    """联通性测试:发一条最小请求。"""
    row = await db.get(AgentConfig, agent_id)
    if not row:
        raise HTTPException(404, "Agent 不存在")
    try:
        adapter = build_adapter(
            provider=row.provider,
            api_key=decrypt(row.api_key_enc),
            base_url=row.base_url,
            model=row.model,
        )
        ok = await adapter.health_check()
        return {"ok": ok, "agent": row.name, "provider": row.provider}
    except ValueError as e:
        # provider 不支持,返回 400 而非 502
        logger.error(f"Agent provider 不支持: {e}")
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.exception("Agent 测试失败")
        raise HTTPException(502, f"测试失败: {e}")