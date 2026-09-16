import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Applies the idempotent Aiven schema (app_users flavor — the one the API
// actually runs against) on every boot so a fresh database needs no manual
// migration before queries stop 500ing. CREATE TABLE IF NOT EXISTS /
// CREATE OR REPLACE / DROP TRIGGER IF EXISTS make this safe to re-run.
export async function bootstrapSchema() {
  const schemaPath = process.env.SCHEMA_SQL_PATH || path.join(__dirname, 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.warn(`[bootstrap] schema not found at ${schemaPath}, skipping`);
    return;
  }
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(sql);
  console.log('[bootstrap] schema + triggers ensured');
}