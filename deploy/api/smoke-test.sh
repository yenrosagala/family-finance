#!/usr/bin/env bash
# Multi-tenant isolation smoke test.
#
# Registers two separate households against a RUNNING api server, creates an
# account in each, and asserts that household A cannot see household B's
# accounts (and vice versa). This is the one thing static review cannot
# confirm — it needs a real Postgres behind the running server.
#
# Usage:
#   1. Start the API against your real MASTER_DATABASE_URL:
#        cd api && npm start
#   2. In another terminal:
#        ./smoke-test.sh                 # defaults to http://localhost:4000
#        API_BASE=https://your-host ./smoke-test.sh
#
# Exits non-zero and prints which assertion failed if isolation is broken.
# Safe to re-run — each run uses fresh, randomly-suffixed emails/household
# names, so it never collides with a previous run's data.

set -euo pipefail

API_BASE="${API_BASE:-http://localhost:4000}"
SUFFIX=$(date +%s)$RANDOM

pass() { echo "  OK: $1"; }
fail() { echo "  FAIL: $1"; exit 1; }

req() {
  # req METHOD PATH [TOKEN] [JSON_BODY]
  local method="$1" path="$2" token="${3:-}" body="${4:-}"
  local args=(-s -X "$method" "${API_BASE}${path}" -H 'Content-Type: application/json')
  [ -n "$token" ] && args+=(-H "Authorization: Bearer ${token}")
  [ -n "$body" ] && args+=(-d "$body")
  curl "${args[@]}"
}

json() { python3 -c "import sys, json; d=json.load(sys.stdin); print(d$1)"; }

echo "== Registering household A =="
REG_A=$(req POST /api/auth/register "" "{\"email\":\"a-${SUFFIX}@test.com\",\"password\":\"secret123\",\"householdName\":\"Household A ${SUFFIX}\"}")
echo "$REG_A"
TOKEN_A=$(echo "$REG_A" | json "['token']") || fail "register A did not return a token"
pass "household A registered"

echo
echo "== Registering household B =="
REG_B=$(req POST /api/auth/register "" "{\"email\":\"b-${SUFFIX}@test.com\",\"password\":\"secret123\",\"householdName\":\"Household B ${SUFFIX}\"}")
echo "$REG_B"
TOKEN_B=$(echo "$REG_B" | json "['token']") || fail "register B did not return a token"
pass "household B registered"

echo
echo "== Creating an account in household A =="
ACC_A=$(req POST /api/accounts "$TOKEN_A" "{\"name\":\"A-Only-Account-${SUFFIX}\",\"type\":\"cash\"}")
echo "$ACC_A"
echo "$ACC_A" | json "['account']['id']" >/dev/null || fail "could not create account in household A"
pass "account created in household A"

echo
echo "== Creating an account in household B =="
ACC_B=$(req POST /api/accounts "$TOKEN_B" "{\"name\":\"B-Only-Account-${SUFFIX}\",\"type\":\"cash\"}")
echo "$ACC_B"
echo "$ACC_B" | json "['account']['id']" >/dev/null || fail "could not create account in household B"
pass "account created in household B"

echo
echo "== Asserting household A only sees its own account =="
LIST_A=$(req GET /api/accounts "$TOKEN_A")
echo "$LIST_A" | grep -q "A-Only-Account-${SUFFIX}" || fail "household A cannot see its own account"
echo "$LIST_A" | grep -q "B-Only-Account-${SUFFIX}" && fail "ISOLATION BROKEN: household A can see household B's account"
pass "household A sees only its own account"

echo
echo "== Asserting household B only sees its own account =="
LIST_B=$(req GET /api/accounts "$TOKEN_B")
echo "$LIST_B" | grep -q "B-Only-Account-${SUFFIX}" || fail "household B cannot see its own account"
echo "$LIST_B" | grep -q "A-Only-Account-${SUFFIX}" && fail "ISOLATION BROKEN: household B can see household A's account"
pass "household B sees only its own account"

echo
echo "== Registering household C via invite code (join flow) =="
INVITE_A=$(echo "$REG_A" | json "['household']['inviteCode']")
JOIN_C=$(req POST /api/auth/join "" "{\"email\":\"c-${SUFFIX}@test.com\",\"password\":\"secret123\",\"inviteCode\":\"${INVITE_A}\"}")
echo "$JOIN_C"
TOKEN_C=$(echo "$JOIN_C" | json "['token']") || fail "join via invite code did not return a token"
pass "member C joined household A via invite code"

echo
echo "== Asserting joined member C sees household A's account (not a new empty one) =="
LIST_C=$(req GET /api/accounts "$TOKEN_C")
echo "$LIST_C" | grep -q "A-Only-Account-${SUFFIX}" || fail "joined member C does not see household A's existing data"
pass "member C correctly lands in household A, not a separate schema"

echo
echo "All isolation checks passed."
