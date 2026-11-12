"""Split a multi-statement SQL file (with DO $$ blocks) into single statements."""
from __future__ import annotations


def split_sql_statements(sql: str) -> list[str]:
    """Statement splitter that understands `--` comments and $$ dollar-quoting.

    asyncpg executes exactly one statement per round-trip, so the canonical
    schema file must be cut into pieces. Dollar-quoted blocks (DO $$ ... $$)
    are kept as ONE statement each.
    """
    statements: list[str] = []
    buf: list[str] = []
    in_dollar = False

    for line in sql.splitlines():
        stripped = line.strip()
        if not in_dollar and (not stripped or stripped.startswith("--")):
            continue
        buf.append(line)
        if "$$" in line:
            if line.count("$$") % 2 == 1:
                in_dollar = not in_dollar
        if not in_dollar and stripped.endswith(";"):
            stmt = "\n".join(buf).strip()
            if stmt:
                statements.append(stmt)
            buf = []

    tail = "\n".join(buf).strip()
    if tail:
        statements.append(tail)
    return statements
