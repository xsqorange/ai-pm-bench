"""一次性脚本:把 agent_configs.provider 中的旧值(MiniMax / MiniMax 等)规范化。"""
import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.db.models.agent import AgentConfig
from app.services.agents.registry import normalize_provider
from app.core.logger import logger


async def main():
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(select(AgentConfig))).scalars().all()
        changed = 0
        for r in rows:
            norm = normalize_provider(r.provider)
            if norm and norm != r.provider:
                logger.info(f"Migrate: id={r.id} {r.name!r} provider {r.provider!r} -> {norm!r}")
                r.provider = norm
                changed += 1
        await db.commit()
        print(f"[migrate_providers] OK - updated {changed}/{len(rows)} records")


if __name__ == "__main__":
    asyncio.run(main())