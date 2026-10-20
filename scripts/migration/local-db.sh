#!/usr/bin/env bash
# Recreate a throwaway local database and apply every migration in order.
# Usage: DB_URL=postgres://postgres:postgres@localhost:5432 scripts/migration/local-db.sh vbm_test
set -euo pipefail
DB_URL=${DB_URL:-postgres://postgres:postgres@localhost:5432}
NAME=${1:-vbm_test}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
psql "$DB_URL/postgres" -q -v ON_ERROR_STOP=1 -c "drop database if exists $NAME" -c "create database $NAME"
psql "$DB_URL/$NAME" -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/00_local_supabase_shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "apply $(basename "$f")"
  psql "$DB_URL/$NAME" -q -v ON_ERROR_STOP=1 -f "$f"
done
psql "$DB_URL/$NAME" -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/seed.sql"
