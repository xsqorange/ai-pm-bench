"""Workbench status checker (called by status.bat)."""
import asyncio
import asyncpg
import re
import sys
from pathlib import Path

def read_env(path: Path) -> dict:
    env = {}
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()
    return env


async def main():
    env_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[2] / ".env"
    env = read_env(env_path)
    url = env.get("DATABASE_URL", "")
    m = re.match(r".*://([^:]+):([^@]+)@([^:/]+):(\d+)/(\w+)", url)
    if not m:
        print("   Cannot parse DATABASE_URL")
        return
    user, pwd, host, port, dbname = m.groups()
    try:
        conn = await asyncio.wait_for(
            asyncpg.connect(host=host, port=int(port), user=user, password=pwd, database=dbname),
            timeout=3,
        )
    except Exception as e:
        print(f"   FAIL: {e}")
        return
    v = await conn.fetchval("SELECT version()")
    print(f"   Connected: {v.split( )[0]}")
    tables = [
        "agent_configs", "projects", "requirements", "subtasks",
        "conversations", "messages",
        "review_reports", "performance_reports", "documents",
    ]
    for t in tables:
        n = await conn.fetchval(f"SELECT COUNT(*) FROM {t}")
        print(f"   {t:<30s} {n:>5d}")
    await conn.close()


asyncio.run(main())
