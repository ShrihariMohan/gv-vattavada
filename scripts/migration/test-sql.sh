#!/usr/bin/env bash
# Build a throwaway Postgres DB from the migrations and run the SQL integration tests.
set -euo pipefail
DB_URL=${DB_URL:-postgres://postgres:postgres@localhost:5432}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
export PGOPTIONS='-c client_min_messages=warning'
"$ROOT/scripts/migration/local-db.sh" vbm_test > /dev/null
for t in "$ROOT"/supabase/tests/[1-9]*_test.sql; do
  echo "== $(basename "$t")"
  psql "$DB_URL/vbm_test" -q -v ON_ERROR_STOP=1 -At -f "$t"
done
