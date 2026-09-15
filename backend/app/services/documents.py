"""文档生成 + AI 润色。"""
from __future__ import annotations
import re
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.models.document import Document
from app.db.models.project import Project
from app.services.agents.orchestrator import stream_chat
from app.core.logger import logger


DOC_TEMPLATES = {
    "README": """你是资深工程师。基于项目信息生成一份专业 README.md(中文)。

## 输出章节
1. # 项目名 + 一句话简介
2. ## 简介 — 核心定位、解决的问题
3. ## 目录结构 — 关键模块说明
4. ## 快速开始 — Windows / Linux 命令
5. ## 配置 — 关键环境变量
6. ## 开发指南 — 常用脚本
7. ## 许可证

不要输出解释性前言,直接生成 Markdown。
""",
    "API": """你是 API 文档专家。基于项目信息生成一份 API 文档。

## 输出章节
1. # API 概览
2. ## 认证 — 如何获取和使用 token
3. ## 通用约定 — base URL、错误码格式、分页
4. ## 端点列表 — 每个端点用 H3 + 表格(方法/路径/参数/响应)
5. ## 示例 — curl + 响应 JSON

不要输出解释性前言,直接生成 Markdown。
""",
    "ARCH": """你是架构师。基于项目信息生成架构文档。

## 输出章节
1. # 架构概览(用 mermaid 画系统图)
2. ## 模块划分
3. ## 数据流
4. ## 关键决策及理由
5. ## 部署拓扑

不要输出解释性前言,直接生成 Markdown。
""",
    "CHANGELOG": """你是发布工程师。基于 git 历史或项目信息生成 CHANGELOG.md。

## 输出格式
# Changelog
## [版本] - 日期
### Added
### Changed
### Fixed

如无信息,从模板生成空章节。不要输出解释性前言。
""",
    "DEPLOY": """你是 DevOps 工程师。生成部署文档。

## 输出章节
1. # 部署
2. ## 前置依赖
3. ## 环境变量
4. ## 启动命令
5. ## 健康检查
6. ## 常见问题

不要输出解释性前言,直接生成 Markdown。
""",
}


POLISH_PROMPT = """你是技术写作专家。优化以下 Markdown 文档,使其更清晰、更专业。
{instruction if instruction else "主要改进:补充细节、修正语法、统一风格、添加示例。"}

要求:
1. 保持原有章节结构与代码块不变
2. 不丢失任何关键信息
3. 输出 Markdown

原文:
---
{document}
"""


async def _project_context(db: AsyncSession, project_id: int) -> str:
    proj = await db.get(Project, project_id)
    if not proj:
        raise ValueError(f"项目不存在: {project_id}")
    parts = [
        f"项目名: {proj.name}",
        f"路径: {proj.path}",
        f"技术栈: {', '.join(proj.tech_stack or []) or 'unknown'}",
    ]
    if proj.description:
        parts.append(f"描述: {proj.description}")
    return "\n".join(parts)


async def generate_document(
    db: AsyncSession,
    project_id: int,
    agent_id: int,
    doc_type: str,
) -> Document:
    if doc_type not in DOC_TEMPLATES:
        raise ValueError(f"不支持的文档类型: {doc_type}")
    context = await _project_context(db, project_id)
    user_msg = f"{context}\n\n---\n\n{DOC_TEMPLATES[doc_type]}"
    full = ""
    async for chunk, _ in stream_chat(
        db, agent_id,
        [{"role": "user", "content": user_msg}],
        temperature=0.4,
    ):
        full += chunk
    title = f"{doc_type} - {await _project_name(db, project_id)}"
    doc = Document(
        project_id=project_id,
        title=title,
        type=doc_type,
        content=full,
        tags=["auto-generated"],
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    logger.info(f"[documents] generated {doc_type} for project {project_id} ({len(full)} chars)")
    return doc


async def polish_document(
    db: AsyncSession,
    doc_id: int,
    agent_id: int,
    instruction: str,
) -> Document:
    doc = await db.get(Document, doc_id)
    if not doc:
        raise ValueError(f"文档不存在: {doc_id}")
    user_msg = POLISH_PROMPT.format(
        instruction=f"\n特殊要求:{instruction}" if instruction else "",
        document=doc.content,
    )
    full = ""
    async for chunk, _ in stream_chat(
        db, agent_id,
        [{"role": "user", "content": user_msg}],
        temperature=0.3,
    ):
        full += chunk
    doc.content = full
    await db.commit()
    await db.refresh(doc)
    logger.info(f"[documents] polished doc {doc_id} ({len(full)} chars)")
    return doc


async def _project_name(db: AsyncSession, project_id: int) -> str:
    proj = await db.get(Project, project_id)
    return proj.name if proj else "Unknown"