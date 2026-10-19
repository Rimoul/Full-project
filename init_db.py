"""Initialize tables only when the existing database is compatible.

This script intentionally refuses to modify a legacy `users`/`products`/`cart_items`
layout. Run it against a fresh test database first. Use Alembic or a reviewed
migration for existing data; create_all() is not a schema migration tool.
"""
from sqlalchemy import inspect

import models3  # registers core models
import auth_models  # registers auth support tables
from database import Base, engine

inspector = inspect(engine)
existing_tables = set(inspector.get_table_names())

# If a table already exists, every model column expected by this version must exist.
# Extra columns are allowed, but missing columns mean a migration is required.
problems = []
for table_name, table in Base.metadata.tables.items():
    if table_name not in existing_tables:
        continue
    actual = {column["name"] for column in inspector.get_columns(table_name)}
    expected = {column.name for column in table.columns}
    missing = sorted(expected - actual)
    if missing:
        problems.append(f"{table_name}: missing columns {', '.join(missing)}")

if problems:
    print("STOP: the database schema does not match models3.py/schemas4.py.")
    print("No tables were changed. Take a backup ansd prepare a reviewed migration first.")
    print("\n".join(problems))
    raise SystemExit(2)

Base.metadata.create_all(bind=engine)
print("Database initialized: missing tables were created; existing compatible tables were left intact.")
