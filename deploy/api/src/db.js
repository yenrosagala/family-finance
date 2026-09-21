import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

// ─── helpers ────────────────────────────────────────────────────────────────

function isRemoteUrl(url) {
  // An explicit sslmode=disable (e.g. a Docker Compose service name like "db")
  // opts out of SSL, so an internal no-SSL Postgres is reachable.
  if (/sslmode=disable/.test(url || '')) return false;
  return url && !/localhost|127\.0\.0\.1/.test(url);
}

// Detect known transaction-mode poolers (e.g. Supabase pgbouncer on :6543
// with ?pgbouncer=true, or an explicit pool_mode=transaction param).
// Transaction pooling recycles the underlying connection between statements,
// which breaks two things this app relies on: (1) SET search_path issued on
// checkout may not survive to the next statement, silently exposing the
// wrong household's tables; (2) multi-statement BEGIN/COMMIT blocks used by
// several routes (account creation, joins) are not guaranteed atomic.
// We fail loudly at boot instead of risking silent cross-household leakage.
function isLikelyTransactionPooler(url) {
  return /pgbouncer=true|pool_mode=transaction|:6543\b/.test(url || '');
}

function makePool(connectionString, { schema } = {}) {
  if (isLikelyTransactionPooler(connectionString)) {
    throw new Error(
      'Refusing to connect: this connection string looks like a transaction-mode ' +
      'pooler (port 6543 / pgbouncer=true). Multi-tenant schema routing requires a ' +
      'session-mode connection (Supabase: port 5432 "Session" pooler, or a direct ' +
      'connection) so SET search_path and BEGIN/COMMIT are honored per-request. ' +
      'See api/.env.example.'
    );
  }

  const pool = new Pool({
    connectionString,
    ssl: isRemoteUrl(connectionString) ? { rejectUnauthorized: false } : false,
    // Keep per-schema pools small so we don't exhaust Postgres connections
    // when many households are active at once.
    max: 5,
    idleTimeoutMillis: 30_000,
  });

  if (schema) {
    // Set search_path on every physical connection the pool opens, not just
    // once via a connection-string `options` param. This is what actually
    // guarantees isolation: it re-applies on reconnects and doesn't depend
    // on any provider correctly parsing `options=-csearch_path=...` out of
    // a URL (some poolers/proxies strip unknown query params).
    pool.on('connect', (client) => {
      client.query(`SET search_path TO "${schema}"`).catch((err) => {
        console.error(`[db] failed to set search_path to "${schema}":`, err.message);
      });
    });
  }

  return pool;
}

// ─── Master DB ──────────────────────────────────────────────────────────────
// One global Supabase project owned by you (the developer).
// Stores: app_users, households_registry.
// Never holds household financial data.

if (!process.env.MASTER_DATABASE_URL) {
  throw new Error('MASTER_DATABASE_URL is required');
}

export const masterDb = makePool(process.env.MASTER_DATABASE_URL);

// ─── Household pool cache ────────────────────────────────────────────────────
// One Pool per household schema, reused across requests.
// Creating a new Pool on every request would exhaust Postgres connections.
// Keyed by schemaName (stable, one per household) rather than by a
// URL-with-embedded-options string, since search_path is now enforced in
// code (see makePool) rather than via the connection string.

const householdPools = new Map();

export function getHouseholdPool(dbUrl, schemaName) {
  const key = schemaName || dbUrl;
  if (!householdPools.has(key)) {
    householdPools.set(key, makePool(dbUrl, { schema: schemaName }));
  }
  return householdPools.get(key);
}

// ─── Legacy default export ───────────────────────────────────────────────────
// Kept so existing imports of `pool` from non-tenant routes (auth register/login)
// still work without changes. Points at the master DB.
// Routes that need the household DB use req.householdDb instead.

export default masterDb;

