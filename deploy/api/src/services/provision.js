import { masterDb, getHouseholdPool } from '../db.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Path to your existing schema.sql — used as the migration template
// for every new household schema. This is the same schema the old
// bootstrapSchema() applied to the single shared DB (api/src/db/schema.sql);
// each household now gets its own copy of it inside a dedicated schema.
const SCHEMA_SQL_PATH = join(__dirname, '../db/schema.sql');

// ─── generateInviteCode ──────────────────────────────────────────────────────

export function generateInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// ─── provisionHouseholdSchema ────────────────────────────────────────────────
//
// Called when an admin creates a new household.
// Creates a dedicated Postgres schema inside your single Supabase project,
// runs all table migrations inside it, and registers it in the master DB.
//
// Returns: { householdId, inviteCode, schemaName }

export async function provisionHouseholdSchema({ householdName, adminEmail }) {
  // Use a sanitized slug as the schema name.
  // UUID suffix makes it unique even for households with the same name.
  const slug = householdName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .slice(0, 32);
  const suffix = Math.random().toString(36).slice(2, 8);
  const schemaName = `hh_${slug}_${suffix}`;

  const code = generateInviteCode();

  // The household's connection uses the same Supabase/Postgres project as
  // the master DB, but every query is scoped to this schema. Isolation is
  // enforced by db.js (SET search_path on every physical connection) using
  // the schemaName below — the db_url itself is stored as-is, with no
  // embedded options param to rely on.
  const householdDbUrl = process.env.MASTER_DATABASE_URL;

  // 1. Create the schema in Postgres
  await masterDb.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

  // 2. Run your existing schema.sql inside the new schema
  //    getHouseholdPool sets search_path on connect, so CREATE TABLE etc.
  //    land in the right schema without further qualification.
  const schemaPool = getHouseholdPool(householdDbUrl, schemaName);
  const client = await schemaPool.connect();
  try {
    const schemaSql = readFileSync(SCHEMA_SQL_PATH, 'utf8');
    await client.query(schemaSql);
  } finally {
    client.release();
  }

  // 3. Register in master households_registry
  const { rows } = await masterDb.query(
    `INSERT INTO households_registry
       (household_name, invite_code, db_url, schema_name, admin_email)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [householdName, code, householdDbUrl, schemaName, adminEmail]
  );
  const householdId = rows[0].id;

  return { householdId, inviteCode: code, schemaName };
}

// ─── deprovisionHouseholdSchema ──────────────────────────────────────────────
//
// Called when a household admin deletes the household.
// Drops the entire schema (all tables + data) and removes the registry row.
// This is PERMANENT — make sure to confirm with the user before calling.

export async function deprovisionHouseholdSchema(householdId) {
  const { rows } = await masterDb.query(
    `SELECT schema_name FROM households_registry WHERE id = $1`,
    [householdId]
  );
  if (!rows[0]) throw new Error('Household not found');

  const { schema_name: schemaName } = rows[0];

  // Drop schema and everything in it
  await masterDb.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);

  // Remove from registry
  await masterDb.query(
    `DELETE FROM households_registry WHERE id = $1`,
    [householdId]
  );
}
