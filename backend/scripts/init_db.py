"""独立运行的数据库初始化脚本(被 start.bat 调用)。"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.db.session import init_db  # noqa: E402


async def main():
    try:
        await init_db()
        print("[init_db] OK - 数据库表结构已创建")
    except Exception as e:
        print(f"[init_db] FAIL - {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())