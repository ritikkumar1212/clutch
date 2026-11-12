"""Apply docs/02-database-schema.sql to the configured database (idempotent)."""
from __future__ import annotations

import asyncio
import pathlib
import sys

from app.scripts.sql_loader import split_sql_statements

SCHEMA_PATH = pathlib.Path(__file__).resolve().parents[3] / "docs" / "02-database-schema.sql"


async def main() -> int:
    from sqlalchemy import text

    from app.database import engine

    statements = split_sql_statements(SCHEMA_PATH.read_text())
    async with engine.begin() as conn:
        for stmt in statements:
            await conn.execute(text(stmt))
    await engine.dispose()
    print(f"schema applied: {len(statements)} statements from {SCHEMA_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
