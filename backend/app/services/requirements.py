"""需求服务:生成联合方案 / 拆子任务(都用 LLM)。"""
from __future__ import annotations
import json
import re
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.models.requirement import Requirement, Subtask
from app.db.models.project import Project
from app.services.agents.orchestrator import stream_chat
from app.core.logger import logger


SOLUTION_PROMPT = """你是资深软件架构师。请为以下需求设计一份"联合解决方案"。

## 需求
{requirement_title}

{requirement_description}

## 关联项目
{projects_text}

## 输出要求(严格 Markdown)
1. **背景与目标** — 简述业务动机 + 量化目标(可用/性能/可维护性)。
2. **方案对比** — 至少 2 个候选方案,每个列:核心思路、优点、缺点、风险。
3. **跨项目依赖分析** — 每个关联项目要改什么模块、调用什么接口、暴露什么 API。
4. **数据模型变更** — 表结构 / DTO / 消息体(如有)。
5. **实施步骤** — 分 MVP 阶段(最小可上线)→ 完整阶段(全部特性)。
6. **风险点与回退方案** — 列出 3-5 个最关键风险,每个配 mitigation。

不要输出任何解释性前言,直接开始 Markdown。"""

DECOMPOSE_PROMPT = """你是资深工程师。请把以下需求拆解为 {count} 个可独立交付的子任务。

## 需求
{requirement_title}

{requirement_description}

## 关联项目
{projects_text}

## 输出格式(严格 JSON 数组)
每个元素:
{{
  "project_id": <int|null>,  // 关联项目 ID,跨项目任务填 null
  "module": "模块名",       // 如 "auth" / "frontend" / "db schema"
  "title": "一句话标题",
  "description": "详细说明",
  "estimate_hours": <float> // 估算工时
}}

不要输出 JSON 以外的内容。如果填不出的字段用 null。"""


def _projects_text(projects: list[Project]) -> str:
    lines = []
    for p in projects:
        tech = ", ".join(p.tech_stack or []) or "unknown"
        lines.append(f"- id={p.id} **{p.name}** [{tech}] — 路径: {p.path}")
    return "\n".join(lines) if lines else "(无关联项目)"


async def get_projects_by_ids(db: AsyncSession, ids: list[int]) -> list[Project]:
    if not ids:
        return []
    rows = (await db.execute(select(Project).where(Project.id.in_(ids)))).scalars().all()
    return list(rows)


async def generate_solution(db: AsyncSession, requirement_id: int, agent_id: int) -> str:
    req = await db.get(Requirement, requirement_id)
    if not req:
        raise ValueError(f"需求不存在: {requirement_id}")
    projects = await get_projects_by_ids(db, req.project_ids or [])
    user_msg = SOLUTION_PROMPT.format(
        requirement_title=req.title,
        requirement_description=req.description or "(无详细描述)",
        projects_text=_projects_text(projects),
    )
    full = ""
    async for chunk, _ in stream_chat(db, agent_id, [{"role": "user", "content": user_msg}], temperature=0.4):
        full += chunk
    req.solution_doc = full
    await db.commit()
    logger.info(f"[requirements] solution generated for req {requirement_id} ({len(full)} chars)")
    return full


async def decompose_subtasks(db: AsyncSession, requirement_id: int, agent_id: int, count: int = 5) -> list[Subtask]:
    req = await db.get(Requirement, requirement_id)
    if not req:
        raise ValueError(f"需求不存在: {requirement_id}")
    projects = await get_projects_by_ids(db, req.project_ids or [])
    user_msg = DECOMPOSE_PROMPT.format(
        count=count,
        requirement_title=req.title,
        requirement_description=req.description or "(无详细描述)",
        projects_text=_projects_text(projects),
    )
    full = ""
    async for chunk, _ in stream_chat(db, agent_id, [{"role": "user", "content": user_msg}], temperature=0.4):
        full += chunk

    # Parse JSON from LLM output
    m = re.search(r"```json\s*(\[.*?\])\s*```", full, re.S)
    if not m:
        m = re.search(r"(\[.*\])", full, re.S)
    if not m:
        logger.warning(f"[requirements] 模型未返回有效 JSON: {full[:200]}")
        return []

    try:
        items = json.loads(m.group(1))
    except json.JSONDecodeError as e:
        logger.warning(f"[requirements] JSON parse failed: {e}")
        return []

    # 验证 project_id 是否在合法范围内
    valid_project_ids = {p.id for p in projects}
    created = []
    for item in items[:count]:
        pid = item.get("project_id")
        if pid is not None and pid not in valid_project_ids:
            pid = None
        st = Subtask(
            requirement_id=requirement_id,
            project_id=pid,
            module=item.get("module", "") or "",
            title=item.get("title", "")[:255],
            description=item.get("description", "") or "",
            estimate_hours=float(item.get("estimate_hours", 0) or 0),
            status="todo",
        )
        db.add(st)
        created.append(st)
    await db.commit()
    logger.info(f"[requirements] decomposed req {requirement_id} into {len(created)} subtasks")
    return created