#!/usr/bin/env bash
# Phase 0 restore rehearsal: load a production dump into a throwaway local Postgres and prove
# the counts/totals match the production baseline exactly. Do not continue the migration if
# this fails.
#
#   supabase db dump --db-url "$PROD_DB_URL" -f backups/$DAY/schema.sql
#   supabase db dump --db-url "$PROD_DB_URL" --data-only -f backups/$DAY/data.sql
#   psql "$PROD_DB_URL" -At -f scripts/migration/phase0-baseline.sql > backups/$DAY/baseline-prod.json
#   scripts/migration/restore-rehearsal.sh backups/$DAY
set -euo pipefail
DIR=${1:?backup directory with schema.sql, data.sql, baseline-prod.json}
DB_URL=${DB_URL:-postgres://postgres:postgres@localhost:5432}
NAME=${RESTORE_DB:-vbm_restore}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
export PGOPTIONS='-c client_min_messages=warning'
psql "$DB_URL/postgres" -q -v ON_ERROR_STOP=1 -c "drop database if exists $NAME" -c "create database $NAME"
psql "$DB_URL/$NAME" -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/00_local_supabase_shim.sql"
# Supabase dumps reference extensions/roles that plain Postgres lacks; keep going on those and
# rely on the baseline comparison below to prove the data itself restored completely.
psql "$DB_URL/$NAME" -q -f "$DIR/schema.sql" > "$DIR/restore-schema.log" 2>&1 || true
psql "$DB_URL/$NAME" -q -v ON_ERROR_STOP=1 -f "$DIR/data.sql" > "$DIR/restore-data.log" 2>&1
psql "$DB_URL/$NAME" -At -f "$ROOT/scripts/migration/phase0-baseline.sql" > "$DIR/baseline-restored.json"
node "$ROOT/scripts/migration/compare-baselines.mjs" "$DIR/baseline-prod.json" "$DIR/baseline-restored.json"
